//import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

initializeApp();

import { MeetingCreateRequest, SpeechCreateRequest, SpeechType } from "../../src/types";

export const createMeeting = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    const user_email = req.auth?.token.email;
    if (!user_email) return { status: "ERROR", message: "Unauthenticated" };

    const db = getFirestore();

    const data = req.data as MeetingCreateRequest;

    await db.collection("meetings").doc(data.code).set({
      name: data.name,
      code: data.code,
      createdAt: Timestamp.now(),
      createdBy: user_email,
    });

    // create a meeting settings document with default settings
    await db.collection("meetings").doc(data.code).collection("meetingSettings").doc("settings").set({
      isPublic: true,
      requireAuth: false,
      adminEmails: [user_email],
      defaultSpeechType: "DEFAULT",
    });

    await db.collection("meetings").doc(data.code).collection("speechTypes").doc("DEFAULT").set({
      label: "puheenvuoro",
      priority: 1000,
      icon: "raised_hand"
    } as SpeechType);

    await db.collection("meetings").doc(data.code).collection("speechTypes").doc("COMMENT").set({
      label: "repliikki",
      priority: 500,
      icon: "peace-hand"
    } as SpeechType);

    await db.collection("meetings").doc(data.code).collection("speechTypes").doc("TECHNICAL").set({
      label: "tekninen",
      priority: 10,
      icon: "time-out"
    } as SpeechType);

    return { status: "OK" };
  }
);

export const createSpeech = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    const db = getFirestore();
    const data = req.data as SpeechCreateRequest;

    // Validate meeting exists
    const meetingRef = db.collection("meetings").doc(data.meetingCode);
    const meetingDoc = await meetingRef.get();

    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }

    // Validate speech type exists
    const speechTypeRef = meetingRef.collection("speechTypes").doc(data.type);
    const speechTypeDoc = await speechTypeRef.get();

    if (!speechTypeDoc.exists) {
      return { status: "ERROR", message: "Invalid speech type" };
    }

    const priority = speechTypeDoc.data()?.priority || 0;

    const counterRef = meetingRef.collection("counters").doc("speeches");
    const speechRef = meetingRef.collection("speeches").doc();

    // Transaction: increment counter + create speech
    await db.runTransaction(async (tx) => {
      const counterSnap = await tx.get(counterRef);

      const last = counterSnap.exists ? counterSnap.get("last") || 0 : 0;
      const nextOrdinal = last + 1;

      // Update counter
      tx.set(counterRef, { last: nextOrdinal }, { merge: true });

      // Create speech with ordinal
      tx.set(speechRef, {
        speakerName: data.speakerName,
        description: data.description,
        createdAt: Timestamp.now(),
        started: false,
        startedAt: null,
        completed: false,
        completedAt: null,
        type: data.type,
        skipped: false,
        priority: priority,
        ordinal: nextOrdinal,
      });
    });

    return { status: "OK" };
  }
);


export const checkIfMeetingAdmin = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    const user_email = req.auth?.token.email;
    if (!user_email) return { status: "ERROR", message: "Unauthenticated" };

    const db = getFirestore();

    const meetingCode = req.data.meetingCode as string;

    const settingsDoc = await db.collection("meetings").doc(meetingCode).collection("meetingSettings").doc("settings").get();

    if (!settingsDoc.exists) {
      return { status: "ERROR", message: "Meeting settings not found" };
    }

    const adminEmails = settingsDoc.data()?.adminEmails as string[] | undefined;

    if (adminEmails && adminEmails.includes(user_email)) {
      return { status: "OK", isAdmin: true };
    } else {
      return { status: "OK", isAdmin: false };
    }
  }
);

export const createProposal = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    //const user_email = req.auth?.token.email;
    //if (!user_email) return { status: "ERROR", message: "Unauthenticated" };

    const db = getFirestore();

    const data = req.data as {
      meetingCode: string;
      proposerName: string;
      description: string;
    };

    const meetingRef = db.collection("meetings").doc(data.meetingCode);
    const meetingDoc = await meetingRef.get();

    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }

    await meetingRef.collection("proposals").add({
      proposerName: data.proposerName,
      description: data.description,
      open: true,
      createdAt: Timestamp.now(),
    });

    return { status: "OK" };
  }
);

export const createVotingSession = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();

    const data = req.data as {
      meetingCode: string;
      proposalIds: string[];
    };

    if (!data.meetingCode || !Array.isArray(data.proposalIds) || data.proposalIds.length === 0) {
      return { status: "ERROR", message: "Invalid input" };
    }

    const meetingRef = db.collection("meetings").doc(data.meetingCode);
    const meetingDoc = await meetingRef.get();
    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }

    // Fetch proposals once (validate + get description for label)
    const proposals: { id: string; description: string }[] = [];
    for (const proposalId of data.proposalIds) {
      const proposalDoc = await meetingRef.collection("proposals").doc(proposalId).get();
      if (!proposalDoc.exists) {
        return { status: "ERROR", message: `Proposal not found: ${proposalId}` };
      }
      proposals.push({
        id: proposalId,
        description: proposalDoc.data()?.description ?? "Unknown proposal",
      });
    }

    // Build voteOptions (StoredVoteOption[])
    let type: "ONE-OF-PROPOSALS" | "FOR-AGAINST-ABSTAIN";
    const voteOptions: any[] = [];

    if (data.proposalIds.length === 1) {
      type = "FOR-AGAINST-ABSTAIN";
      voteOptions.push({ id: "FOR", type: "FOR-AGAINST-ABSTAIN", vote: "FOR", label: "For" });
      voteOptions.push({ id: "AGAINST", type: "FOR-AGAINST-ABSTAIN", vote: "AGAINST", label: "Against" });
      voteOptions.push({ id: "ABSTAIN", type: "FOR-AGAINST-ABSTAIN", vote: "ABSTAIN", label: "Abstain" });
    } else {
      type = "ONE-OF-PROPOSALS";
      for (const p of proposals) {
        voteOptions.push({
          id: `PROPOSAL:${p.id}`,
          type: "PROPOSAL",
          proposalId: p.id,
          label: p.description,
        });
      }
      voteOptions.push({ id: "ABSTAIN", type: "FOR-AGAINST-ABSTAIN", vote: "ABSTAIN", label: "Abstain" });
    }

    const votingSessionRef = meetingRef.collection("votingSessions").doc();
    await votingSessionRef.set({
      meetingCode: data.meetingCode,
      type,
      open: true,
      createdAt: FieldValue.serverTimestamp(),
      voteOptions,
      proposalIds: data.proposalIds, // optional convenience
    });

    return { status: "OK", votingSessionId: votingSessionRef.id };
  }
);

type StoredVoteOption =
  | { id: string; type: "PROPOSAL"; proposalId: string; label?: string }
  | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

export const castVote = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();

    const data = req.data as {
      meetingCode: string;
      votingSessionId: string;
      voteOptionId: string;
      voterId?: string;    // for anonymous
      voterName?: string;  // for anonymous
    };

    if (!data?.meetingCode || !data?.votingSessionId || !data?.voteOptionId) {
      throw new HttpsError("invalid-argument", "Missing meetingCode, votingSessionId or voteOptionId.");
    }

    const authedUid = req.auth?.uid ?? null;
    const voterKey = authedUid ?? data.voterId?.trim();
    const voterName = (data.voterName ?? "").trim();

    if (!voterKey) {
      throw new HttpsError("unauthenticated", "Anonymous voting requires voterId.");
    }
    if (!authedUid && !voterName) {
      throw new HttpsError("invalid-argument", "Anonymous voting requires voterName.");
    }

    const sessionRef = db
      .collection("meetings")
      .doc(data.meetingCode)
      .collection("votingSessions")
      .doc(data.votingSessionId);

    const voteRef = sessionRef.collection("votes").doc(voterKey);

    await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new HttpsError("not-found", "Voting session not found.");

      const session = sessionSnap.data() as { open: boolean; voteOptions: StoredVoteOption[] };

      if (!session.open) throw new HttpsError("failed-precondition", "Voting session is closed.");

      const options = Array.isArray(session.voteOptions) ? session.voteOptions : [];
      const valid = options.some((o) => o.id === data.voteOptionId);
      if (!valid) throw new HttpsError("invalid-argument", "Invalid voteOptionId.");

      const existingVoteSnap = await tx.get(voteRef);
      if (existingVoteSnap.exists) {
        throw new HttpsError("already-exists", "You have already voted in this session.");
      }

      tx.set(voteRef, {
        votingSessionId: data.votingSessionId,
        voterUid: voterKey,
        voterName: authedUid ? null : voterName,
        voteOptionId: data.voteOptionId,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { status: "OK" };
  }
);
