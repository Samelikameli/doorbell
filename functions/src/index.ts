import * as logger from "firebase-functions/logger";

import { initializeApp } from "firebase-admin/app";

import { onRequest, Request, onCall } from "firebase-functions/v2/https";


initializeApp();

export const door = onCall({
  region: 'europe-north1',
}, async (req) => {
  const uuid = req.data?.uuid;

  if (!uuid) {
    return { status: 'ERROR', message: 'Missing UUID' };
  }
  if (!req) {
    return { status: 'ERROR' };
  }

  const user_email = req.auth?.token.email;

  if (!user_email) {
    return { status: 'ERROR' };
  }

  const db = getFirestore();
  const settingsQuery = db.collection('settings').doc('settings');
  const settings = (await settingsQuery.get()).data() as { adminEmails: string[] };

  if (!settings || !settings.adminEmails.includes(user_email)) {
    return { status: 'ERROR' };
  }

  // user is now authenticated (logged in as admin)
  const mg = mailgun.client({ username: 'api', key: mailgun_api_key.value(), url: 'https://api.eu.mailgun.net' });

  const snap = await db.collection('submissions').doc(uuid).get();
  if (!snap.exists) {
    return { status: 'ERROR', message: 'Invoice not found' };
  }
  const invoiceData = snap.data() as FirestoreInvoiceData;
  if (!invoiceData?.invoiceImage) {
    return { status: 'ERROR', message: 'Invoice image missing' };
  }


  const bucket = storage.bucket();
  const file = bucket.file(`invoices/${invoiceData.invoiceImage}`);
  const [fileBuffer] = await file.download();

  const { msg_reminder } = await getMailTemplates(invoiceData, fileBuffer, `${email_user.value()}@${email_domain.value()}`, replyTo.value());
  await mg.messages.create(email_domain.value(), msg_reminder);

  // add reminder to invoice data
  await db.collection('submissions').doc(uuid).update({
    reminders: FieldValue.arrayUnion({
      email: invoiceData.to,
      date: Timestamp.now()
    })
  });

  return { status: 'OK' };
});
