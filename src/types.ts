import { User } from "firebase/auth";

export interface UserContextValue {
    user: User | null;
    loading: boolean;
}

export interface Meeting {
    code: string;
    name: string;
    startsAt: Date | null;
    createdAt: Date;
    createdBy: string;
    requireLogin: boolean;
    isPublic: boolean;
    defaultSpeechType: string;
    requireAuth: boolean;
}

export interface Speech {
    speakerName: string;
    description: string;
    createdAt: Date;
    started: boolean;
    startedAt: Date | null;
    completed: boolean;
    completedAt: Date | null;
    id: string;
    skipped: boolean;
    priority: number;
    type: string; // speech type id, not label, not the whole object
    ordinal: number;
}

export type ProposalCloseReason = "ACCEPTED" | "REJECTED";

export interface Proposal {
    proposerUid: string;
    proposerName: string;
    description: string;
    createdAt: Date;
    id: string;
    supporterUids?: string[];
    supporterNames?: string[];
    open: boolean;
    closedAs?: ProposalCloseReason;
    closedAt?: Date;
    closedBy?: string;
    baseProposal: boolean; // pohjaesitys
}

export type StoredVoteOption =
    | { id: string; type: "PROPOSAL"; proposalId: string; label?: string }
    | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

export type HydratedVoteOption =
    | { id: string; type: "PROPOSAL"; proposalId: string; proposal: Proposal; label?: string }
    | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

export interface VotingSession {
    label: string;
    votingSessionId: string;
    voteOptions: HydratedVoteOption[];
    votes: Vote[];
    voters?: Voter[]; // only for closed sessions where we fetch the list of voters together with the session
    type: "ONE-OF-PROPOSALS" | "FOR-AGAINST-ABSTAIN";
    votePublicity: "PUBLIC" | "PRIVATE";
    open: boolean;
    createdAt: Date;
    closedAt?: Date;
    closedBy?: string; // uid
    proposalIds: string[]; // for convenience, denormalized from voteOptions

    // UI-only state derived from /voters/{uid} and (PUBLIC only) /votes query
    hasVoted?: boolean;
    myVoteOptionId?: string;
}

export interface Vote {
    votingSessionId: string;
    voterUid?: string;
    voterName?: string;
    voteOptionId: string;
}
export interface Voter {
    votingSessionId: string;
    voterUid: string;
    voterName: string;
}

export type MeetingCreateRequest = Omit<Meeting, "createdAt" | "createdBy">;

export type SpeechCreateRequest = Omit<Speech, "id" | "createdAt" | "started" | "startedAt" | "completed" | "completedAt" | "skipped" | "priority" | "ordinal"> & { meetingCode: string };

export interface SpeechAction {
    label: string;
    onPress: () => void;
    icon: string;
}

export interface SpeechType {
    id: string;
    label: string;
    priority: number;
    icon: string;
}