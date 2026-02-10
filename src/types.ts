import { User } from "firebase/auth";

export interface UserContextValue {
    user: User | null;
    loading: boolean;
}

export interface Meeting {
    code: string;
    name: string;
    createdAt: Date;
    createdBy: string;
}

export interface Speech {
    meetingCode: string;
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

export interface Proposal {
    meetingCode: string;
    proposerUid: string;
    proposerName: string;
    description: string;
    createdAt: Date;
    id: string;
    supporterUids?: string[];
    supporterNames?: string[];
    open: boolean;
    baseProposal: boolean; // pohjaesitys
}

export type StoredVoteOption =
  | { id: string; type: "PROPOSAL"; proposalId: string; label?: string }
  | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

export type HydratedVoteOption =
  | { id: string; type: "PROPOSAL"; proposalId: string; proposal: Proposal; label?: string }
  | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

export interface VotingSession {
  votingSessionId: string;
  meetingCode: string;
  voteOptions: HydratedVoteOption[]; // hydrated in UI
  votes: Vote[];
  type: "ONE-OF-PROPOSALS" | "FOR-AGAINST-ABSTAIN";
  votePublicity: "PUBLIC" | "PRIVATE";
  open: boolean;
  createdAt: Date;
}

export interface Vote {
    votingSessionId: string;
    voterUid: string;
    voterName: string;
    voteOptionId: string;
    createdAt: Date;
}

export type MeetingCreateRequest = Omit<Meeting, "createdAt" | "createdBy">;

export type SpeechCreateRequest = Omit<Speech, "id" | "createdAt" | "started" | "startedAt" | "completed" | "completedAt" | "skipped" | "priority" | "ordinal">;

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