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
    proposerName: string;
    description: string;
    createdAt: Date;
    id: string;
}

export interface VotingSession {

}

export type MeetingCreateRequest = Omit<Meeting, "createdAt" | "createdBy">;

export type SpeechCreateRequest = Omit<Speech, "id" | "createdAt" | "started" | "startedAt" | "completed" | "completedAt" | "skipped" | "priority" | "ordinal">;

export interface SpeechAction {
    label: string;
    onPress: () => void;
}

export interface SpeechType {
    id: string;
    label: string;
    priority: number;
    icon: string;
}