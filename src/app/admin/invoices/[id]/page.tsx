"use client";
import { StatusChip } from '@/components/StatusChip';
import { AccountingChip } from '@/components/AccountingChip';
import { useUser } from '@/context/UserContext';
import { db, storage, functions } from '@/firebase';
import { FirestoreInvoiceData } from '@/types';
import { getFormattedSum, getFormattedDateTime } from '@/utils';
import { Button } from '@heroui/button';
import { HeroUIProvider } from '@heroui/system';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { httpsCallable } from "firebase/functions";
import { Input } from '@heroui/input';

const InvoicePage: React.FC = () => {
    const pathname = useParams();
    const uuid = pathname.id as string;
    const user = useUser();
    const [invoice, setInvoice] = useState<FirestoreInvoiceData | null>(null);
    const [pdf, setPdf] = useState<string | null>(null);
    const [reminding, setReminding] = useState<boolean>(false);

    useEffect(() => {
        if (!user) {
            return;
        }

        const q = doc(collection(db, "submissions"), uuid);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const data: FirestoreInvoiceData = querySnapshot.data() as FirestoreInvoiceData;
            setInvoice(data);
        });

        return () => { unsubscribe(); };
    }, [user]);

    const handleSendToProcountor = (uuid: string) => async () => {
        console.log("Sending to Procountor", uuid);
        updateDoc(doc(collection(db, "submissions"), uuid), {
            status: 'ACCEPTED' as FirestoreInvoiceData["status"]
        });
    };

    const handleRejection = (uuid: string) => async () => {
        console.log("Rejecting", uuid);
        updateDoc(doc(collection(db, "submissions"), uuid), {
            status: 'REJECTED' as FirestoreInvoiceData["status"]
        });
    }
    const handleReminder = (uuid: string) => async () => {
        if (!user) {
            return;
        }
        if (reminding) {
            return;
        }
        setReminding(true);
        console.log("Reminding", uuid);
        const remindInvoice = httpsCallable(functions, 'remindInvoice');
        await remindInvoice({ uuid: uuid });
        setReminding(false);
    };

    const handleChangeTo = async (uuid: string, to: string) => {
        console.log("Changing to", uuid, to);
        await updateDoc(doc(collection(db, "submissions"), uuid), {
            to: to
        });
    };

    useEffect(() => {
        const getPdfAddress = async () => {
            if (!invoice || !user) {
                return;
            }
            const url = await getDownloadURL(ref(storage, `invoices/${invoice.invoiceImage}`));
            setPdf(url);
        };
        getPdfAddress();
    }, [invoice]);


    return (
        <HeroUIProvider>
            <div className={`flex items-center flex-row w-full text-foreground bg-background min-h-screen gap-4 p-4`}>
                <div className='flex flex-col'>
                    {invoice && (
                        <>
                            <div className='flex flex-col gap-2'>
                                <p>Laskun ID: {invoice.uuid}</p>
                                <p>Laskun päiväys: {invoice.date}</p>
                                <p>Laskun summa: {getFormattedSum(invoice.total)}</p>
                                <div className='flex flex-row'><p>Laskun status:</p> <StatusChip status={invoice.status} /></div>
                                {!invoice.accountingByRow && <AccountingChip key={invoice.uuid} accountingItem={invoice} />}
                                <h3>Laskurivit:</h3>
                                {invoice.rows.map((row, index) => (
                                    <div key={index} className='flex flex-col gap-2'>
                                        <h4>{`Tosite ${index + 1}`}</h4>
                                        <h5>Summa: {getFormattedSum(row.sum)}</h5>
                                        <h5>Teksti: {row.label}</h5>
                                        {invoice.accountingByRow && <AccountingChip key={index} accountingItem={row} />}
                                    </div>
                                ))}
                                <p>Laskun hyväksyjä:</p>
                                <Input
                                    placeholder="Hyväksyjän sähköposti"
                                    isDisabled={!['UNFINISHED'].includes(invoice.status)}
                                    value={invoice.to}
                                    onChange={(e) => setInvoice({ ...invoice, to: e.target.value })}
                                />
                                <Button
                                    color="primary"
                                    isDisabled={!['UNFINISHED'].includes(invoice.status)}
                                    onPress={() => handleChangeTo(invoice.uuid, invoice.to)}
                                >
                                    Vaihda hyväksyjää
                                </Button>
                                <p>Laskun lähettäjä: {invoice.email}</p>
                                <p>{invoice.emailNotifications ? "Sähköposti-ilmoitukset päällä" : "Sähköposti-ilmoitukset pois päältä"}</p>

                                <Button
                                    color="success"
                                    isDisabled={['SENT-TO-PROCOUNTOR', 'ACCEPTED'].includes(invoice.status)}
                                    onPress={handleSendToProcountor(invoice.uuid)}>
                                    Hyväksy
                                </Button>

                                <Button
                                    color="danger"
                                    isDisabled={['SENT-TO-PROCOUNTOR', 'REJECTED'].includes(invoice.status)}
                                    onPress={handleRejection(invoice.uuid)}>
                                    Hylkää
                                </Button>
                                <Button
                                    color="warning"
                                    isDisabled={['SENT-TO-PROCOUNTOR', 'REJECTED'].includes(invoice.status)}
                                    isLoading={reminding}
                                    onPress={handleReminder(invoice.uuid)}>
                                    Muistuta hyväksyjää
                                </Button>
                                <p>Aiemmat muistutukset:</p>
                                <ul>
                                    {invoice.reminders?.map((reminder, index) => (
                                        <li key={index}>{reminder.email}: {getFormattedDateTime(reminder.date.toDate())}</li>
                                    ))}
                                </ul>
                            </div>

                        </>
                    )
                    }
                </div>
                <div className='flex w-full'>
                    {pdf && (
                        <embed src={pdf} className='w-full h-[90vh]' />
                    )}
                </div>
            </div>
        </HeroUIProvider >
    );
};

export default InvoicePage;
