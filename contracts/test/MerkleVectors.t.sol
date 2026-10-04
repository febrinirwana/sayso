// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract MerkleVectors is Test {
    string private fixture;
    bytes32 private root;
    uint256 private chunkCount;

    function setUp() public {
        fixture = vm.readFile("test/fixtures/merkle.json");
        root = vm.parseJsonBytes32(fixture, ".root");
        chunkCount = vm.parseJsonUint(fixture, ".chunkCount");
    }

    function testTypescriptVectorsMatchSolidity() public view {
        assertEq(chunkCount, 5);
        for (uint256 i = 0; i < chunkCount; i++) {
            string memory path = string.concat(".chunks[", vm.toString(i), "]");
            bytes32 clipId = vm.parseJsonBytes32(fixture, string.concat(path, ".clipId"));
            uint8 engine = uint8(vm.parseJsonUint(fixture, string.concat(path, ".engine")));
            uint32 index = uint32(vm.parseJsonUint(fixture, string.concat(path, ".index")));
            uint64 startMs = uint64(vm.parseJsonUint(fixture, string.concat(path, ".startMs")));
            uint64 endMs = uint64(vm.parseJsonUint(fixture, string.concat(path, ".endMs")));
            string memory tokensJson = vm.parseJsonString(fixture, string.concat(path, ".tokensJson"));
            bytes32 tokensHash = vm.parseJsonBytes32(fixture, string.concat(path, ".tokensHash"));
            bytes32 leaf = vm.parseJsonBytes32(fixture, string.concat(path, ".leaf"));
            bytes32[] memory proof = vm.parseJsonBytes32Array(fixture, string.concat(path, ".proof"));

            assertEq(index, i);
            assertEq(keccak256(bytes(tokensJson)), tokensHash);
            assertEq(keccak256(abi.encode(clipId, engine, index, startMs, endMs, tokensHash)), leaf);
            assertTrue(MerkleProof.verify(proof, root, leaf));
        }
    }

    function testFlippedLeavesFailVerification() public view {
        for (uint256 i = 0; i < chunkCount; i++) {
            string memory path = string.concat(".chunks[", vm.toString(i), "]");
            bytes32 leaf = vm.parseJsonBytes32(fixture, string.concat(path, ".leaf"));
            bytes32[] memory proof = vm.parseJsonBytes32Array(fixture, string.concat(path, ".proof"));
            assertFalse(MerkleProof.verify(proof, root, bytes32(uint256(leaf) ^ 1)));
        }
    }
}
