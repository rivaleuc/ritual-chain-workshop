// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test-only mocks of the Ritual LLM precompile (0x0802). They reproduce the real
// short-running async envelope: abi.encode(bytes simmedInput, bytes actualOutput),
// where actualOutput = abi.encode(bool hasError, bytes completion, bytes reasoning,
// string errorMessage, (string,string,string) convoHistory). Stateless fallbacks
// so they can be installed at 0x0802 via hardhat_setCode in tests.

struct MockConvoHistory {
    string storageType;
    string path;
    string secretsName;
}

contract MockLLMOk {
    fallback(bytes calldata) external returns (bytes memory) {
        MockConvoHistory memory ch = MockConvoHistory("", "", "");
        bytes memory completion = bytes('{"winnerIndex": 1, "summary": "ok"}');
        bytes memory actual = abi.encode(false, completion, bytes(""), string(""), ch);
        return abi.encode(bytes(""), actual);
    }
}

contract MockLLMErr {
    fallback(bytes calldata) external returns (bytes memory) {
        MockConvoHistory memory ch = MockConvoHistory("", "", "");
        bytes memory actual =
            abi.encode(true, bytes(""), bytes(""), string("model failed"), ch);
        return abi.encode(bytes(""), actual);
    }
}
