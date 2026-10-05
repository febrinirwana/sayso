// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {ReceiverTemplate} from "./vendor/chainlink/ReceiverTemplate.sol";
import {OutcomeToken} from "./OutcomeToken.sol";
import {KuruTrade} from "./KuruTrade.sol";

contract SaysoMarkets is ReceiverTemplate, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    enum EpisodeState { Scheduled, Live, Closed, Settled }
    enum WordState { Open, SaidPending, Yes, No, Void }

    struct Episode {
        bytes32 clipId;
        bytes32 rootA;
        bytes32 rootB;
        uint64 startsAt;
        uint64 endsAt;
        uint64 closedAt;
        uint8 wordCount;
        uint8 resolvedCount;
        bool listed;
        bool closed;
    }

    struct Word {
        uint32 episodeId;
        WordState state;
        uint16 chunkA;
        uint16 chunkB;
        uint32 offsetMs;
        bytes32 text;
        address yes;
        address no;
        address market;
        uint256 sets;
    }

    IERC20 public immutable AUSD;
    address public immutable KURU_ROUTER;
    address public immutable TOKEN_IMPL;

    address public operator;
    bool public episodesPaused;
    address public reportOrigin;
    uint256 public totalSets;
    uint32 public nextEpisodeId = 1;
    uint256 public nextWordId = 1;

    mapping(uint32 episodeId => Episode) private _episodes;
    mapping(uint256 wordId => Word) private _words;
    mapping(uint32 episodeId => uint256[]) private _episodeWords;

    error OnlyOperator();
    error EpisodesPaused();
    error InvalidWordCount();
    error InvalidWordText();
    error InvalidEpisodeTime();
    error UnknownEpisode();
    error UnknownWord();
    error EpisodeAlreadyListed();
    error EpisodeEnded();
    error ReportsDisabled();
    error EpisodeNotListed();
    error EpisodeIsClosed();
    error WordIsFinal();

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event EpisodesPausedUpdated(bool paused);
    event ReportOriginUpdated(address indexed previousOrigin, address indexed newOrigin);
    event EpisodeCreated(uint32 indexed episodeId, bytes32 clipId, bytes32 rootA, bytes32 rootB, uint64 startsAt, uint64 endsAt);
    event WordAdded(uint32 indexed episodeId, uint256 indexed wordId, bytes32 text, address yes, address no);
    event WordListed(uint256 indexed wordId, address market);
    event SetMinted(uint256 indexed wordId, address indexed account, uint256 amount);
    event SetBurned(uint256 indexed wordId, address indexed account, uint256 amount);
    event Traded(uint256 indexed wordId, address indexed account, uint8 side, uint256 tokenAmount, uint256 ausdAmount);
    event WordFlagged(uint32 indexed episodeId, uint256 indexed wordId, uint16 chunkA, uint16 chunkB, uint32 offsetMs);
    event EvidenceReady(uint32 indexed episodeId, uint256[] wordIds);
    event EpisodeClosed(uint32 indexed episodeId);
    event WordResolved(uint32 indexed episodeId, uint256 indexed wordId, uint8 outcome, bytes32 evidenceHash);
    event EpisodeSettled(uint32 indexed episodeId);
    event Redeemed(uint256 indexed wordId, address indexed account, uint256 tokenAmount, uint256 ausdOut);
    event WordVoided(uint256 indexed wordId);

    constructor(address forwarder, address ausd, address kuruRouter, address tokenImpl) ReceiverTemplate(forwarder) {
        AUSD = IERC20(ausd);
        KURU_ROUTER = kuruRouter;
        TOKEN_IMPL = tokenImpl;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    function setOperator(address newOperator) external onlyOwner {
        address previousOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(previousOperator, newOperator);
    }

    function setEpisodesPaused(bool paused) external onlyOwner {
        episodesPaused = paused;
        emit EpisodesPausedUpdated(paused);
    }

    function setReportOrigin(address newOrigin) external onlyOwner {
        address previousOrigin = reportOrigin;
        reportOrigin = newOrigin;
        emit ReportOriginUpdated(previousOrigin, newOrigin);
    }

    function episode(uint32 episodeId) external view returns (Episode memory) {
        return _getEpisode(episodeId);
    }

    function word(uint256 wordId) external view returns (Word memory) {
        return _getWord(wordId);
    }

    function episodeWords(uint32 episodeId) external view returns (uint256[] memory) {
        _getEpisode(episodeId);
        return _episodeWords[episodeId];
    }

    function createEpisode(
        bytes32 clipId, bytes32 rootA, bytes32 rootB, uint64 startsAt, uint64 endsAt, bytes32[] calldata texts
    ) external onlyOperator nonReentrant returns (uint32 episodeId) {
        if (episodesPaused) revert EpisodesPaused();
        if (texts.length == 0 || texts.length > 8) revert InvalidWordCount();
        if (startsAt < block.timestamp || endsAt <= startsAt) revert InvalidEpisodeTime();
        for (uint256 i; i < texts.length; ++i) {
            if (texts[i] == bytes32(0)) revert InvalidWordText();
        }

        episodeId = nextEpisodeId++;
        Episode storage ep = _episodes[episodeId];
        ep.clipId = clipId;
        ep.rootA = rootA;
        ep.rootB = rootB;
        ep.startsAt = startsAt;
        ep.endsAt = endsAt;
        ep.wordCount = uint8(texts.length);
        emit EpisodeCreated(episodeId, clipId, rootA, rootB, startsAt, endsAt);

        for (uint256 i; i < texts.length; ++i) {
            uint256 wordId = nextWordId++;
            Word storage w = _words[wordId];
            w.episodeId = episodeId;
            w.text = texts[i];
            string memory text = _wordText(texts[i]);
            w.yes = Clones.clone(TOKEN_IMPL);
            w.no = Clones.clone(TOKEN_IMPL);
            OutcomeToken(w.yes).initialize(string.concat("YES ", text), "YES");
            OutcomeToken(w.no).initialize(string.concat("NO ", text), "NO");
            _episodeWords[episodeId].push(wordId);
            emit WordAdded(episodeId, wordId, texts[i], w.yes, w.no);
        }
    }

    function listEpisode(uint32 episodeId) external onlyOperator nonReentrant {
        Episode storage ep = _getEpisode(episodeId);
        if (ep.listed) revert EpisodeAlreadyListed();
        if (block.timestamp >= ep.endsAt) revert EpisodeEnded();
        ep.listed = true;
        uint256[] storage ids = _episodeWords[episodeId];
        for (uint256 i; i < ids.length; ++i) {
            Word storage w = _words[ids[i]];
            w.market = KuruTrade.deployMarket(KURU_ROUTER, w.yes, address(AUSD));
            emit WordListed(ids[i], w.market);
        }
    }

    function mintSet(uint256 wordId, uint256 amount, address to) external nonReentrant {
        _mintSet(wordId, amount, to);
    }

    function mintSetWithPermit(
        uint256 wordId, uint256 amount, address to, uint256 deadline, uint8 v, bytes32 r, bytes32 s
    ) external nonReentrant {
        // A relayer may already have submitted this permit; allowance remains authoritative.
        try IERC20Permit(address(AUSD)).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _mintSet(wordId, amount, to);
    }

    function _mintSet(uint256 wordId, uint256 amount, address to) private {
        Word storage w = _getWord(wordId);
        _requireUnresolved(w);
        Episode storage ep = _episodes[w.episodeId];
        if (!ep.listed) revert EpisodeNotListed();
        if (ep.closed) revert EpisodeIsClosed();
        AUSD.safeTransferFrom(msg.sender, address(this), amount);
        w.sets += amount;
        totalSets += amount;
        OutcomeToken(w.yes).mint(to, amount);
        OutcomeToken(w.no).mint(to, amount);
        emit SetMinted(wordId, to, amount);
    }

    function burnSet(uint256 wordId, uint256 amount, address to) external nonReentrant {
        Word storage w = _getWord(wordId);
        _requireUnresolved(w);
        OutcomeToken(w.yes).burn(msg.sender, amount);
        OutcomeToken(w.no).burn(msg.sender, amount);
        w.sets -= amount;
        totalSets -= amount;
        AUSD.safeTransfer(to, amount);
        emit SetBurned(wordId, msg.sender, amount);
    }

    function buyYes(uint256 wordId, uint256 ausdIn, uint256 minYesOut) external nonReentrant returns (uint256 yesOut) {
        Word storage w = _getTradableWord(wordId);
        AUSD.safeTransferFrom(msg.sender, address(this), ausdIn);
        uint256 spent;
        (yesOut, spent) = KuruTrade.marketBuy(w.market, w.yes, address(AUSD), ausdIn, minYesOut);
        if (ausdIn > spent) AUSD.safeTransfer(msg.sender, ausdIn - spent);
        if (yesOut != 0) IERC20(w.yes).safeTransfer(msg.sender, yesOut);
        emit Traded(wordId, msg.sender, 0, yesOut, spent);
    }

    function sellYes(uint256 wordId, uint256 yesIn, uint256 minAusdOut) external nonReentrant returns (uint256 ausdOut) {
        Word storage w = _getTradableWord(wordId);
        IERC20 yes = IERC20(w.yes);
        yes.safeTransferFrom(msg.sender, address(this), yesIn);
        uint256 sold;
        (ausdOut, sold) = KuruTrade.marketSell(w.market, w.yes, address(AUSD), yesIn, minAusdOut);
        if (yesIn > sold) yes.safeTransfer(msg.sender, yesIn - sold);
        if (ausdOut != 0) AUSD.safeTransfer(msg.sender, ausdOut);
        emit Traded(wordId, msg.sender, 1, sold, ausdOut);
    }

    function _getTradableWord(uint256 wordId) private view returns (Word storage w) {
        w = _getWord(wordId);
        _requireUnresolved(w);
        if (!_episodes[w.episodeId].listed) revert EpisodeNotListed();
    }

    function _requireUnresolved(Word storage w) private view {
        if (w.state != WordState.Open && w.state != WordState.SaidPending) revert WordIsFinal();
    }

    function _getEpisode(uint32 episodeId) private view returns (Episode storage ep) {
        ep = _episodes[episodeId];
        if (ep.wordCount == 0) revert UnknownEpisode();
    }

    function _getWord(uint256 wordId) private view returns (Word storage w) {
        w = _words[wordId];
        if (w.episodeId == 0) revert UnknownWord();
    }

    function _wordText(bytes32 text) private pure returns (string memory) {
        uint256 length = 32;
        while (length > 0 && text[length - 1] == bytes1(0)) --length;
        bytes memory value = new bytes(length);
        assembly ("memory-safe") {
            mstore(add(value, 32), text)
        }
        return string(value);
    }

    // Until receiver processing lands, even authenticated reports must fail closed.
    function _processReport(bytes calldata) internal pure override {
        revert ReportsDisabled();
    }
}
