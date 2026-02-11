//import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp();

import { Meeting, MeetingCreateRequest, Proposal, ProposalCloseReason, SpeechCreateRequest, SpeechType } from "../../src/types";
import { DecodedIdToken } from "firebase-admin/auth";

const isUserAnonymous = (auth: DecodedIdToken): boolean => {
  return !auth.email;
};

const isMeetingParticipant = async (db: FirebaseFirestore.Firestore, meeting: Meeting, authToken?: DecodedIdToken): Promise<boolean> => {
  const requireLogin = meeting.requireLogin ?? false;
  if (!requireLogin) {
    return !!authToken;
  }
  else {
    if (!authToken) {
      return false;
    }
    else {
      return !isUserAnonymous(authToken);
    }
  }
};

const isMeetingAdmin = async (db: FirebaseFirestore.Firestore, meeting: Meeting, authToken?: DecodedIdToken): Promise<boolean> => {
  if (!authToken || isUserAnonymous(authToken) || !authToken.email) {
    return false;
  }

  const settingsDoc = await db.collection("meetings").doc(meeting.code).collection("meetingSettings").doc("settings").get();
  const settings = settingsDoc.data();

  if (!settings) {
    return false;
  }

  const adminEmails: string[] = settings.adminEmails || [];
  return adminEmails.includes(authToken.email);
}

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
      createdAt: FieldValue.serverTimestamp(),
      createdBy: user_email,
      requireLogin: data.requireLogin,
      startsAt: data.startsAt,
    } as Omit<Meeting, "createdAt">);

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
      icon: "DEFAULT"
    } as SpeechType);

    await db.collection("meetings").doc(data.code).collection("speechTypes").doc("COMMENT").set({
      label: "repliikki",
      priority: 500,
      icon: "COMMENT"
    } as SpeechType);

    await db.collection("meetings").doc(data.code).collection("speechTypes").doc("TECHNICAL").set({
      label: "tekninen",
      priority: 10,
      icon: "TECHNICAL"
    } as SpeechType);

    return { status: "OK" };
  }
);

export const createSpeech = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");


    const db = getFirestore();
    const data = req.data as SpeechCreateRequest;

    // Validate meeting exists
    const meetingRef = db.collection("meetings").doc(data.meetingCode);
    const meetingDoc = await meetingRef.get();

    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }

    if (!await isMeetingParticipant(db, meetingDoc.data() as Meeting, req.auth?.token)) {
      throw new HttpsError("permission-denied", "You are not a participant of this meeting.");
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
        createdAt: FieldValue.serverTimestamp(),
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

    const meetingRef = db.collection("meetings").doc(meetingCode);
    const meetingDoc = await meetingRef.get();
    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }
    const meeting = meetingDoc.data() as Meeting;

    if (await isMeetingAdmin(db, meeting, req.auth?.token)) {
      return { status: "OK", isAdmin: true };
    } else {
      return { status: "OK", isAdmin: false };
    }
  }
);

export const createProposal = onCall(
  { region: "europe-north1" },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");

    const db = getFirestore();

    const data = req.data as {
      meetingCode: string;
      proposerName: string;
      description: string;
      baseProposal: boolean;
    };

    const meetingRef = db.collection("meetings").doc(data.meetingCode);
    const meetingDoc = await meetingRef.get();

    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }

    if (!await isMeetingParticipant(db, meetingDoc.data() as Meeting, req.auth?.token)) {
      throw new HttpsError("permission-denied", "You are not a participant of this meeting.");
    }

    const proposalRef = await meetingRef.collection("proposals").add({
      meetingCode: data.meetingCode,
      proposerName: data.proposerName,
      proposerUid: uid,
      description: data.description,
      open: true,
      createdAt: FieldValue.serverTimestamp(),
      baseProposal: data.baseProposal,
      supporterUids: [],
    } as Omit<Proposal, "id" | "createdAt">);

    return { status: "OK", proposalId: proposalRef.id };
  }
);


export const createVotingSession = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();

    const data = req.data as { meetingCode?: string; proposalIds?: string[], addBlankOption: boolean };

    const meetingCode = (data?.meetingCode ?? "").trim();
    const proposalIdsRaw = Array.isArray(data?.proposalIds) ? data!.proposalIds : [];

    // normalize + dedupe + drop empties
    const proposalIds = Array.from(
      new Set(proposalIdsRaw.map((x) => String(x).trim()).filter(Boolean))
    );

    if (!meetingCode || proposalIds.length === 0) {
      throw new HttpsError("invalid-argument", "Invalid input.");
    }

    const meetingRef = db.collection("meetings").doc(meetingCode);
    const settingsRef = meetingRef.collection("meetingSettings").doc("settings");

    const meetingDoc = await meetingRef.get();
    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }
    // has to be admin
    if (!await isMeetingAdmin(db, meetingDoc.data() as Meeting, req.auth?.token)) {
      throw new HttpsError("permission-denied", "Only meeting admins can create voting sessions.");
    }
    const userEmail = req.auth?.token.email!;

    // Single transaction: authorize + validate proposals + create session
    const result = await db.runTransaction(async (tx) => {
      const [meetingSnap, settingsSnap] = await Promise.all([
        tx.get(meetingRef),
        tx.get(settingsRef),
      ]);

      if (!meetingSnap.exists) {
        throw new HttpsError("not-found", "Meeting not found");
      }
      if (!settingsSnap.exists) {
        throw new HttpsError("not-found", "Meeting settings not found");
      }

      const adminEmails = (settingsSnap.data()?.adminEmails ?? []) as string[];
      if (!adminEmails.includes(userEmail)) {
        throw new HttpsError("permission-denied", "Only meeting admins can create voting sessions");
      }

      // Fetch proposals inside the transaction so you get a consistent snapshot
      const proposals: { id: string; description: string }[] = [];
      for (const proposalId of proposalIds) {
        const pRef = meetingRef.collection("proposals").doc(proposalId);
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists) {
          throw new HttpsError("not-found", `Proposal not found: ${proposalId}`);
        }
        const pData = pSnap.data() ?? {};
        const description = typeof pData.description === "string" ? pData.description : "Unknown proposal";
        proposals.push({ id: proposalId, description });
      }

      // Build voteOptions (strict type, no any)
      type StoredVoteOption =
        | { id: string; type: "PROPOSAL"; proposalId: string; label?: string }
        | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

      let type: "ONE-OF-PROPOSALS" | "FOR-AGAINST-ABSTAIN";
      const voteOptions: StoredVoteOption[] = [];

      if (proposalIds.length === 1) {
        type = "FOR-AGAINST-ABSTAIN";
        voteOptions.push({ id: "FOR", type: "FOR-AGAINST-ABSTAIN", vote: "FOR", label: "Puolesta" });
        voteOptions.push({ id: "AGAINST", type: "FOR-AGAINST-ABSTAIN", vote: "AGAINST", label: "Vastaan" });
        voteOptions.push({ id: "ABSTAIN", type: "FOR-AGAINST-ABSTAIN", vote: "ABSTAIN", label: "Tyhjä" });
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
        if (data.addBlankOption) {
          voteOptions.push({ id: "ABSTAIN", type: "FOR-AGAINST-ABSTAIN", vote: "ABSTAIN", label: "Tyhjä" });
        }
      }

      const votingSessionRef = meetingRef.collection("votingSessions").doc();

      tx.set(votingSessionRef, {
        label: type === 'FOR-AGAINST-ABSTAIN' ? `Äänestys ehdotuksesta: ${proposals[0].description}` : "Äänestys ehdotuksista",
        meetingCode,
        type,
        open: true,
        votePublicity: "PUBLIC", // or "PRIVATE" if you want closed votes hidden by default
        createdAt: FieldValue.serverTimestamp(),
        voteOptions,
        proposalIds,
        createdBy: userEmail,
      });

      return { votingSessionId: votingSessionRef.id };
    });

    return { status: "OK", votingSessionId: result.votingSessionId };
  }
);


type StoredVoteOption =
  | { id: string; type: "PROPOSAL"; proposalId: string; label?: string }
  | { id: string; type: "FOR-AGAINST-ABSTAIN"; vote: "FOR" | "AGAINST" | "ABSTAIN"; label?: string };

export const castVote = onCall({ region: "europe-north1" }, async (req) => {
  const db = getFirestore();

  const data = req.data as {
    meetingCode: string;
    votingSessionId: string;
    voteOptionId: string;
    voterName?: string;
  };

  if (!req.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const voterUid = req.auth.uid;
  const voterName = (data.voterName ?? "").trim();

  if (!data?.meetingCode || !data?.votingSessionId || !data?.voteOptionId) {
    throw new HttpsError("invalid-argument", "Missing meetingCode, votingSessionId or voteOptionId.");
  }

  const sessionRef = db
    .collection("meetings")
    .doc(data.meetingCode)
    .collection("votingSessions")
    .doc(data.votingSessionId);

  const voteRef = sessionRef.collection("votes").doc(voterUid);

  await db.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new HttpsError("not-found", "Voting session not found.");

    const session = sessionSnap.data() as { open: boolean; voteOptions: StoredVoteOption[] };
    if (!session.open) throw new HttpsError("failed-precondition", "Voting session is closed.");

    const options = Array.isArray(session.voteOptions) ? session.voteOptions : [];
    if (!options.some((o) => o.id === data.voteOptionId)) {
      throw new HttpsError("invalid-argument", "Invalid voteOptionId.");
    }

    if (!voterName) {
      throw new HttpsError("invalid-argument", "voterName is required.");
    }


    const existingVoteSnap = await tx.get(voteRef);
    if (existingVoteSnap.exists) throw new HttpsError("already-exists", "You have already voted in this session.");

    tx.set(voteRef, {
      votingSessionId: data.votingSessionId,
      voterUid,
      voterName: voterName,
      voteOptionId: data.voteOptionId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { status: "OK" };
});

export const closeProposal = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();
    const data = req.data as { meetingCode: string; proposalId: string; closedAs: ProposalCloseReason };

    const meetingCode = (data?.meetingCode ?? "").trim();
    const proposalId = (data?.proposalId ?? "").trim();

    if (!meetingCode || !proposalId) {
      throw new HttpsError("invalid-argument", "Missing meetingCode or proposalId.");
    }

    const settingsRef = db
      .collection("meetings")
      .doc(meetingCode)
      .collection("meetingSettings")
      .doc("settings");

    const proposalRef = db
      .collection("meetings")
      .doc(meetingCode)
      .collection("proposals")
      .doc(proposalId);

    const meetingDoc = await db.collection("meetings").doc(meetingCode).get();
    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }
    // has to be admin
    if (!await isMeetingAdmin(db, meetingDoc.data() as Meeting, req.auth?.token)) {
      throw new HttpsError("permission-denied", "Only meeting admins can close proposals.");
    }
    const userEmail = req.auth?.token.email!;

    await db.runTransaction(async (tx) => {
      const settingsSnap = await tx.get(settingsRef);
      if (!settingsSnap.exists) {
        throw new HttpsError("not-found", "Meeting settings not found");
      }

      const adminEmails = (settingsSnap.data()?.adminEmails ?? []) as string[];
      if (!adminEmails.includes(userEmail)) {
        throw new HttpsError("permission-denied", "Only meeting admins can close proposals");
      }

      const proposalSnap = await tx.get(proposalRef);
      if (!proposalSnap.exists) {
        throw new HttpsError("not-found", "Proposal not found");
      }

      const alreadyClosed = proposalSnap.data()?.open === false;
      if (alreadyClosed) {
        return;
      }

      tx.update(proposalRef, {
        open: false,
        closedAt: FieldValue.serverTimestamp(),
        closedAs: data.closedAs,
        closedBy: userEmail,
      });
    });

    return { status: "OK" };
  }
);


export const closeVotingSession = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();
    const data = req.data as { meetingCode: string; votingSessionId: string };

    const meetingCode = (data?.meetingCode ?? "").trim();
    const votingSessionId = (data?.votingSessionId ?? "").trim();

    if (!meetingCode || !votingSessionId) {
      throw new HttpsError("invalid-argument", "Missing meetingCode or votingSessionId.");
    }

    const settingsRef = db
      .collection("meetings")
      .doc(meetingCode)
      .collection("meetingSettings")
      .doc("settings");

    const sessionRef = db
      .collection("meetings")
      .doc(meetingCode)
      .collection("votingSessions")
      .doc(votingSessionId);

    const meetingDoc = await db.collection("meetings").doc(meetingCode).get();
    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }
    // has to be admin
    if (!await isMeetingAdmin(db, meetingDoc.data() as Meeting, req.auth?.token)) {
      throw new HttpsError("permission-denied", "Only meeting admins can close voting sessions.");
    }
    const userEmail = req.auth?.token.email!;

    await db.runTransaction(async (tx) => {
      const settingsSnap = await tx.get(settingsRef);
      if (!settingsSnap.exists) {
        throw new HttpsError("not-found", "Meeting settings not found");
      }

      const adminEmails = (settingsSnap.data()?.adminEmails ?? []) as string[];
      if (!adminEmails.includes(userEmail)) {
        throw new HttpsError("permission-denied", "Only meeting admins can close voting sessions");
      }

      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) {
        throw new HttpsError("not-found", "Voting session not found");
      }

      const alreadyClosed = sessionSnap.data()?.open === false;
      if (alreadyClosed) {
        return; // idempotent
      }

      tx.update(sessionRef, {
        open: false,
        closedAt: FieldValue.serverTimestamp(),
        closedBy: userEmail,
      });
    });

    return { status: "OK" };
  }
);

export const setProposalSupport = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();

    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const data = req.data as {
      meetingCode?: string;
      proposalId?: string;
      addSupport?: boolean;
      supporterName?: string; // optional: for display only
    };

    const meetingCode = String(data?.meetingCode ?? "").trim();
    const proposalId = String(data?.proposalId ?? "").trim();
    const addSupport = Boolean(data?.addSupport);
    //const supporterName = String(data?.supporterName ?? "").trim();

    if (!meetingCode || !proposalId) {
      throw new HttpsError("invalid-argument", "Missing meetingCode or proposalId.");
    }

    const proposalRef = db
      .collection("meetings")
      .doc(meetingCode)
      .collection("proposals")
      .doc(proposalId);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(proposalRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Proposal not found.");
      }

      const p = snap.data() ?? {};
      if (p.open === false) {
        throw new HttpsError("failed-precondition", "Proposal is closed.");
      }

      const supporterUids: string[] = Array.isArray(p.supporterUids) ? p.supporterUids : [];

      const alreadySupported = supporterUids.includes(uid);

      // Idempotent behavior
      if (addSupport && alreadySupported) return;
      if (!addSupport && !alreadySupported) return;

      if (addSupport) {
        tx.update(proposalRef, {
          supporterUids: FieldValue.arrayUnion(uid),

          // Optional metadata
          lastSupportAt: FieldValue.serverTimestamp(),
        });

        // Optional: store name mapping if you want (requires schema decision)
        // if (supporterName) {
        //   tx.update(proposalRef, {
        //     supporterNames: FieldValue.arrayUnion(supporterName),
        //   });
        // }

      } else {
        tx.update(proposalRef, {
          supporterUids: FieldValue.arrayRemove(uid),

          // Optional metadata
          lastSupportAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return { status: "OK" };
  }
);

export const editProposal = onCall(
  { region: "europe-north1" },
  async (req) => {
    const db = getFirestore();

    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");

    const userEmail = req.auth?.token.email ?? null;

    const data = req.data as {
      meetingCode?: string;
      proposalId?: string;
      description?: string;
      editorName?: string; // optional metadata
    };

    const meetingCode = String(data?.meetingCode ?? "").trim();
    const proposalId = String(data?.proposalId ?? "").trim();
    const newDescription = String(data?.description ?? "").trim();
    const editorName = String(data?.editorName ?? "").trim();

    if (!meetingCode || !proposalId) {
      throw new HttpsError("invalid-argument", "Missing meetingCode or proposalId.");
    }
    if (!newDescription) {
      throw new HttpsError("invalid-argument", "Description is required.");
    }
    if (newDescription.length > 1000) {
      throw new HttpsError("invalid-argument", "Description is too long.");
    }

    const meetingRef = db.collection("meetings").doc(meetingCode);
    const proposalRef = meetingRef.collection("proposals").doc(proposalId);

    // Block edits if proposal is in an OPEN voting session
    // (this is what "in voting" typically means)
    const inVotingSnap = await meetingRef
      .collection("votingSessions")
      .where("open", "==", true)
      .where("proposalIds", "array-contains", proposalId)
      .limit(1)
      .get();

    if (!inVotingSnap.empty) {
      throw new HttpsError("failed-precondition", "Proposal is in an open voting session.");
    }

    const meetingDoc = await meetingRef.get();
    if (!meetingDoc.exists) {
      return { status: "ERROR", message: "Meeting not found" };
    }

    await db.runTransaction(async (tx) => {
      const proposalSnap = await tx.get(proposalRef);

      if (!proposalSnap.exists) {
        throw new HttpsError("not-found", "Proposal not found.");
      }

      const proposal = proposalSnap.data() ?? {};
      const isOpen = proposal.open !== false;
      if (!isOpen) {
        throw new HttpsError("failed-precondition", "Proposal is closed.");
      }

      // Authorization:
      // Allow meeting admins OR the original proposer (if you store proposerUid)
      // If you do not have proposerUid, restrict to admins only.
      const isAdmin = await isMeetingAdmin(db, meetingDoc.data() as Meeting, req.auth?.token);

      const proposerUid = typeof proposal.proposerUid === "string" ? proposal.proposerUid : null;
      const isProposer = proposerUid ? proposerUid === uid : false;

      // If proposerUid is not stored, only admins can edit (safer default)
      const allowed = proposerUid ? (isAdmin || isProposer) : isAdmin;

      if (!allowed) {
        throw new HttpsError("permission-denied", "Not allowed to edit this proposal.");
      }

      // Edit resets supporters
      tx.update(proposalRef, {
        description: newDescription,
        supporterUids: [],

        // optional: if you had supporterNames etc, clear them too
        // supporterNames: [],

        editedAt: FieldValue.serverTimestamp(),
        editedByUid: uid,
        editedByEmail: userEmail,
        editedByName: editorName || null,
      });
    });

    return { status: "OK" };
  }
);
