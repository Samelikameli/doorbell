//import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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