import * as logger from "firebase-functions/logger";
import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import mqtt from "mqtt";

initializeApp();

type SettingsDoc = { adminEmails: string[] };

function publishMqttOnce(params: {
  host: string;
  username: string;
  password: string;
  topic: string;
  message: string;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 5000;
  const opId = crypto.randomUUID();

  logger.info("MQTT publish started", { opId, host: params.host, topic: params.topic, timeoutMs });

  return new Promise((resolve, reject) => {
    const client = mqtt.connect(params.host, {
      username: params.username,
      password: params.password,
      reconnectPeriod: 0,
      connectTimeout: timeoutMs,
      clean: true,
    });

    let finished = false;
    const finish = (err?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const closeOut = (finalErr?: Error) => {
        if (finalErr) {
          logger.error("MQTT publish failed", {
            opId,
            host: params.host,
            topic: params.topic,
            error: finalErr.message,
          });
          reject(finalErr);
        } else {
          logger.info("MQTT publish succeeded", { opId, host: params.host, topic: params.topic });
          resolve();
        }
      };

      const errorObj = err
        ? err instanceof Error
          ? err
          : new Error(String(err))
        : undefined;

      // Graceful disconnect so outbound buffers flush
      client.end(false, () => closeOut(errorObj));
    };

    const timer = setTimeout(() => {
      logger.error("MQTT publish timed out", { opId, host: params.host, topic: params.topic, timeoutMs });
      try {
        client.end(true);
      } catch {}
      finish(new Error("MQTT publish timeout"));
    }, timeoutMs);

    client.once("connect", () => {
      logger.info("MQTT connected", { opId, host: params.host });

      client.publish(params.topic, params.message, { qos: 1, retain: false }, (err) => {
        if (err) return finish(err);
        finish();
      });
    });

    client.once("error", (err) => {
      logger.error("MQTT client error", { opId, host: params.host, error: err.message });
      finish(err);
    });
  });
}

export const door = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    const user_email = req.auth?.token.email;
    if (!user_email) return { status: "ERROR", message: "Unauthenticated" };

    const db = getFirestore();

    const settingsSnap = await db.collection("settings").doc("settings").get();
    const settings = settingsSnap.data() as SettingsDoc | undefined;

    if (!settings || !Array.isArray(settings.adminEmails) || !settings.adminEmails.includes(user_email)) {
      logger.warn(`Unauthorized door open attempt by ${user_email}`);
      return { status: "ERROR", message: "Unauthorized" };
    }
    const uuid = crypto.randomUUID();

    await db.collection("openings").doc(uuid).create({
      email: user_email,
      date: Timestamp.now(),
    });

    logger.log(`Door opened by ${user_email} (UUID: ${uuid})`);

    // HARD-CODED MQTT (DEBUG)
    await publishMqttOnce({
      host: "mqtt://35.231.217.140:1883",
      topic: "door/command",
      message: "OPEN",
      username: "door",
      password: "B41EFE85-D05E-4D1A-A3EC-445DF921F58A",
      timeoutMs: 5000,
    });

    return { status: "OK" };
  }
);


export const schedule = onCall(
  {
    region: "europe-north1",
  },
  async (req) => {
    const user_email = req.auth?.token.email;
    if (!user_email) return { status: "ERROR", message: "Unauthenticated" };

    const time = req.data?.time;
    if (typeof time !== "number") {
      return { status: "ERROR", message: "Invalid time parameter" };
    }
    const uses = req.data?.uses;
    if (typeof uses !== "number" || uses < 0) {
      return { status: "ERROR", message: "Invalid uses parameter" };
    }
    const db = getFirestore();

    const settingsSnap = await db.collection("settings").doc("settings").get();
    const settings = settingsSnap.data() as SettingsDoc | undefined;

    if (!settings || !Array.isArray(settings.adminEmails) || !settings.adminEmails.includes(user_email)) {
      logger.warn(`Unauthorized schedule attempt by ${user_email}`);
      return { status: "ERROR", message: "Unauthorized" };
    }
    const uuid = crypto.randomUUID();

    logger.log(`Door scheduled by ${user_email} (UUID: ${uuid}): time=${time}, uses=${uses}`);

    // HARD-CODED MQTT (DEBUG)
    await publishMqttOnce({
      host: "mqtt://35.231.217.140:1883",
      topic: "door/command",
      message: `SCHEDULE ${time} ${uses}`,
      username: "door",
      password: "B41EFE85-D05E-4D1A-A3EC-445DF921F58A",
      timeoutMs: 5000,
    });

    return { status: "OK" };
  }
);

