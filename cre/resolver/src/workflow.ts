import {
  bytesToHex,
  consensusIdenticalAggregation,
  EVMClient,
  type EVMLog,
  encodeCallMsg,
  getNetwork,
  HTTPClient,
  type HTTPSendRequester,
  handler,
  json,
  LAST_FINALIZED_BLOCK_NUMBER,
  logTriggerConfig,
  ok,
  prepareReportRequest,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { saysoMarketsAbi } from "@sayso/core";
import {
  type Address,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  hexToString,
  isAddress,
  toEventSelector,
  zeroAddress,
} from "viem";
import { z } from "zod";
import { chunkSchema, encodeReport } from "./decide.ts";
import { type ResolverIO, resolve } from "./resolve.ts";

export const configSchema = z.object({
  chainSelectorName: z.literal("monad-testnet"),
  saysoMarkets: z
    .string()
    .refine((value) => isAddress(value) && value.toLowerCase() !== zeroAddress)
    .transform((value) => value as Address),
  revealApiBaseUrl: z.url(),
  reportGasLimit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => BigInt(value) <= 0xffff_ffff_ffff_ffffn),
});
export type Config = z.infer<typeof configSchema>;

// Consensus operates on schema-normalized JSON, never on arbitrary response objects.
const fetchChunk = (sender: HTTPSendRequester, url: string): string => {
  const response = sender.sendRequest({ url, method: "GET" }).result();
  if (!ok(response)) throw new Error(`Chunk HTTP status ${response.statusCode}`);
  return JSON.stringify(chunkSchema.parse(json(response)));
};

function createIO(runtime: Runtime<Config>): ResolverIO {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
  });
  if (!network) throw new Error("Monad testnet selector is unavailable");
  const client = new EVMClient(network.chainSelector.selector);
  const http = new HTTPClient();
  const call = (data: Hex): Hex => {
    const response = client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: runtime.config.saysoMarkets, data }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();
    return bytesToHex(response.data);
  };
  return {
    readEpisode(id) {
      const episode = decodeFunctionResult({
        abi: saysoMarketsAbi,
        functionName: "episode",
        data: call(
          encodeFunctionData({ abi: saysoMarketsAbi, functionName: "episode", args: [id] }),
        ),
      });
      const duration = (episode.endsAt - episode.startsAt) * 1000n;
      if (duration <= 0n || duration > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error("Invalid committed episode duration");
      return {
        id,
        clipId: episode.clipId,
        rootA: episode.rootA,
        rootB: episode.rootB,
        durationMs: Number(duration),
        closed: episode.closed,
        wordCount: episode.wordCount,
      };
    },
    readWord(id) {
      const word = decodeFunctionResult({
        abi: saysoMarketsAbi,
        functionName: "word",
        data: call(encodeFunctionData({ abi: saysoMarketsAbi, functionName: "word", args: [id] })),
      });
      return {
        id,
        episodeId: word.episodeId,
        text: hexToString(word.text, { size: 32 }),
        state: word.state,
        chunkA: word.chunkA,
        chunkB: word.chunkB,
      };
    },
    episodeWords(id) {
      return decodeFunctionResult({
        abi: saysoMarketsAbi,
        functionName: "episodeWords",
        data: call(
          encodeFunctionData({ abi: saysoMarketsAbi, functionName: "episodeWords", args: [id] }),
        ),
      });
    },
    fetchChunk(id, engine, index) {
      const url = `${runtime.config.revealApiBaseUrl.replace(/\/$/, "")}/v1/episodes/${id}/chunks/${engine}/${index}`;
      return JSON.parse(
        http
          .sendRequest(
            runtime,
            fetchChunk,
            consensusIdenticalAggregation<string>(),
          )(url)
          .result(),
      );
    },
    submitReport(report) {
      const signed = runtime.report(prepareReportRequest(encodeReport(report))).result();
      const response = client
        .writeReport(runtime, {
          receiver: runtime.config.saysoMarkets,
          report: signed,
          gasConfig: { gasLimit: runtime.config.reportGasLimit },
        })
        .result();
      if (
        response.txStatus !== TxStatus.SUCCESS ||
        !response.txHash ||
        response.txHash.length !== 32
      )
        throw new Error("Report delivery did not return a successful transaction hash");
      const tx = bytesToHex(response.txHash);
      runtime.log(`Episode ${report.episodeId}: report delivered ${tx}`);
      return tx;
    },
    log(message) {
      runtime.log(message);
    },
  };
}

export function onEvidenceReady(runtime: Runtime<Config>, log: EVMLog): string {
  try {
    if (bytesToHex(log.address).toLowerCase() !== runtime.config.saysoMarkets.toLowerCase())
      throw new Error("Wrong log source");
    const event = decodeEventLog({
      abi: saysoMarketsAbi,
      eventName: "EvidenceReady",
      data: bytesToHex(log.data),
      topics: log.topics.map(bytesToHex) as [Hex, ...Hex[]],
    });
    return resolve("evidence", event.args.episodeId, event.args.wordIds, createIO(runtime));
  } catch {
    runtime.log("EvidenceReady: invalid log or capability initialization; no report");
    return "no-report";
  }
}

export function onEpisodeClosed(runtime: Runtime<Config>, log: EVMLog): string {
  try {
    if (bytesToHex(log.address).toLowerCase() !== runtime.config.saysoMarkets.toLowerCase())
      throw new Error("Wrong log source");
    const event = decodeEventLog({
      abi: saysoMarketsAbi,
      eventName: "EpisodeClosed",
      data: bytesToHex(log.data),
      topics: log.topics.map(bytesToHex) as [Hex, ...Hex[]],
    });
    return resolve("closed", event.args.episodeId, [], createIO(runtime));
  } catch {
    runtime.log("EpisodeClosed: invalid log or capability initialization; no report");
    return "no-report";
  }
}

export function initWorkflow(config: Config) {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: config.chainSelectorName });
  if (!network) throw new Error("Monad testnet selector is unavailable");
  const client = new EVMClient(network.chainSelector.selector);
  return [
    handler(
      client.logTrigger(
        logTriggerConfig({
          addresses: [config.saysoMarkets],
          topics: [[toEventSelector("EvidenceReady(uint32,uint256[])")]],
          confidence: "FINALIZED",
        }),
      ),
      onEvidenceReady,
    ),
    handler(
      client.logTrigger(
        logTriggerConfig({
          addresses: [config.saysoMarkets],
          topics: [[toEventSelector("EpisodeClosed(uint32)")]],
          confidence: "FINALIZED",
        }),
      ),
      onEpisodeClosed,
    ),
  ];
}
