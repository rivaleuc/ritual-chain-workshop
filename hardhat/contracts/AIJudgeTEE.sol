// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

/// @title AIJudgeTEE — Ritual-native hidden-submission bounty (Advanced Track)
/// @notice Unlike commit-reveal, answers are NEVER published on-chain. Participants submit only
///         a ciphertext reference (encrypted to the bounty's TEE/DKMS key) plus a commitment hash.
///         At judging, the LLM inference runs inside the TEE: it fetches the ciphertexts, decrypts
///         them privately in the enclave, judges ALL answers in one batch request, and the contract
///         records only the AI review plus a hash + reference to the revealed-answers bundle. No
///         large plaintext is stored on-chain.
contract AIJudgeTEE is PrecompileConsumer {
    uint256 public constant MAX_SUBMISSIONS = 10;

    uint256 public nextBountyId = 1;

    /// @dev Pointer to an encrypted blob in a DA provider (HF/GCS/Pinata). The `keyRef` names the
    ///      credential inside the executor's encrypted secrets; with a `dkms_encrypted:` prefix the
    ///      executor DKMS-decrypts the blob after download, inside the TEE.
    struct StorageRef {
        string platform; // "hf" | "gcs" | "pinata"
        string path; // org/repo/file or object key or CID
        string keyRef; // credential name, optionally "dkms_encrypted:HF_TOKEN"
    }

    struct EncSubmission {
        address submitter;
        bytes32 commitment; // keccak256(abi.encodePacked(answer, salt, submitter, bountyId))
        StorageRef ciphertextRef; // where the encrypted answer lives
    }

    struct Bounty {
        address owner;
        string title;
        string rubric;
        uint256 reward;
        uint256 submissionDeadline;
        bool judged;
        bool finalized;
        bytes aiReview; // batch judging output (ranking/summary), not the answers
        string revealedAnswersRef; // off-chain bundle of revealed answers (published at judging)
        bytes32 revealedAnswersHash; // keccak256 of that bundle — the on-chain commitment to it
        uint256 winnerIndex;
        EncSubmission[] submissions;
        mapping(address => uint256) submitterSlot; // 1-based; 0 = none
    }

    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    mapping(uint256 => Bounty) internal bounties;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        string title,
        uint256 reward,
        uint256 submissionDeadline
    );
    event EncryptedSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter,
        bytes32 commitment
    );
    event AllAnswersJudged(
        uint256 indexed bountyId,
        bytes aiReview,
        string revealedAnswersRef,
        bytes32 revealedAnswersHash
    );
    event WinnerFinalized(
        uint256 indexed bountyId,
        uint256 indexed winnerIndex,
        address indexed winner,
        uint256 reward
    );

    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }
    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    function createBounty(
        string calldata title,
        string calldata rubric,
        uint256 submissionDeadline
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "reward required");
        require(submissionDeadline > block.timestamp, "deadline in past");

        bountyId = nextBountyId++;
        Bounty storage b = bounties[bountyId];
        b.owner = msg.sender;
        b.title = title;
        b.rubric = rubric;
        b.reward = msg.value;
        b.submissionDeadline = submissionDeadline;
        b.winnerIndex = type(uint256).max;

        emit BountyCreated(bountyId, msg.sender, title, msg.value, submissionDeadline);
    }

    /// @notice Submit an encrypted answer: a commitment hash + a reference to the ciphertext.
    /// @dev No plaintext ever touches the chain. One submission per address.
    function submitEncrypted(
        uint256 bountyId,
        bytes32 commitment,
        StorageRef calldata ciphertextRef
    ) external bountyExists(bountyId) {
        Bounty storage b = bounties[bountyId];
        require(block.timestamp < b.submissionDeadline, "submissions closed");
        require(!b.judged, "already judged");
        require(commitment != bytes32(0), "empty commitment");
        require(bytes(ciphertextRef.path).length > 0, "empty ciphertext ref");
        require(b.submitterSlot[msg.sender] == 0, "already submitted");
        require(b.submissions.length < MAX_SUBMISSIONS, "too many submissions");

        b.submissions.push(
            EncSubmission({
                submitter: msg.sender,
                commitment: commitment,
                ciphertextRef: ciphertextRef
            })
        );
        uint256 index = b.submissions.length - 1;
        b.submitterSlot[msg.sender] = index + 1;

        emit EncryptedSubmitted(bountyId, index, msg.sender, commitment);
    }

    /// @notice Batch judging inside the TEE. The executor decrypts every ciphertext privately and
    ///         runs ONE LLM inference over all answers. The contract stores the review plus a
    ///         hash + reference to the published revealed-answers bundle (not the answers).
    function judgeAll(
        uint256 bountyId,
        bytes calldata llmInput,
        string calldata revealedAnswersRef,
        bytes32 revealedAnswersHash
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage b = bounties[bountyId];
        require(block.timestamp >= b.submissionDeadline, "submissions still open");
        require(!b.judged, "already judged");
        require(!b.finalized, "already finalized");
        require(b.submissions.length > 0, "no submissions");

        bytes memory output = _executePrecompile(LLM_INFERENCE_PRECOMPILE, llmInput);
        (
            bool hasError,
            bytes memory completionData,
            ,
            string memory errorMessage,

        ) = abi.decode(output, (bool, bytes, bytes, string, ConvoHistory));
        require(!hasError, errorMessage);

        b.judged = true;
        b.aiReview = completionData;
        b.revealedAnswersRef = revealedAnswersRef;
        b.revealedAnswersHash = revealedAnswersHash;

        emit AllAnswersJudged(bountyId, completionData, revealedAnswersRef, revealedAnswersHash);
    }

    /// @notice Human-in-the-loop: owner ratifies the winner; AI only recommends.
    function finalizeWinner(
        uint256 bountyId,
        uint256 winnerIndex
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage b = bounties[bountyId];
        require(b.judged, "not judged yet");
        require(!b.finalized, "already finalized");
        require(winnerIndex < b.submissions.length, "invalid index");

        b.finalized = true;
        b.winnerIndex = winnerIndex;

        address winner = b.submissions[winnerIndex].submitter;
        uint256 reward = b.reward;
        b.reward = 0;
        (bool ok, ) = payable(winner).call{value: reward}("");
        require(ok, "payment failed");

        emit WinnerFinalized(bountyId, winnerIndex, winner, reward);
    }

    function getBounty(
        uint256 bountyId
    )
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            string memory title,
            string memory rubric,
            uint256 reward,
            uint256 submissionDeadline,
            bool judged,
            bool finalized,
            uint256 submissionCount,
            uint256 winnerIndex,
            bytes memory aiReview,
            string memory revealedAnswersRef,
            bytes32 revealedAnswersHash
        )
    {
        Bounty storage b = bounties[bountyId];
        return (
            b.owner,
            b.title,
            b.rubric,
            b.reward,
            b.submissionDeadline,
            b.judged,
            b.finalized,
            b.submissions.length,
            b.winnerIndex,
            b.aiReview,
            b.revealedAnswersRef,
            b.revealedAnswersHash
        );
    }

    /// @notice Returns the submitter, commitment, and ciphertext reference. Never plaintext.
    function getSubmission(
        uint256 bountyId,
        uint256 index
    )
        external
        view
        bountyExists(bountyId)
        returns (address submitter, bytes32 commitment, StorageRef memory ciphertextRef)
    {
        Bounty storage b = bounties[bountyId];
        require(index < b.submissions.length, "invalid index");
        EncSubmission storage s = b.submissions[index];
        return (s.submitter, s.commitment, s.ciphertextRef);
    }
}
