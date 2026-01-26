"use client";

//import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import { DatePicker, Form } from "@heroui/react";
import { now, getLocalTimeZone, ZonedDateTime } from "@internationalized/date";

import { FormEvent, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { db, functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "@firebase/firestore";
import { MeetingCreateRequest } from "@/types";
import { I18nProvider } from "@react-aria/i18n";

export default function NewPage() {
    const router = useRouter();

    const { user, loading } = useUser();

    const [code, setCode] = useState("");
    const [checking, setChecking] = useState(false);
    const [existing, setExisting] = useState(false);
    const [name, setName] = useState("");
    const [startTime, setStartTime] = useState<ZonedDateTime | null>(now(getLocalTimeZone()));

    useEffect(() => {
        if (!loading && !user) {
            router.push('/login?redirect=/new');
        }
    }, [user, loading, router]);

    useEffect(() => {
        setChecking(true);
        const checkCode = async () => {
            if (code.length === 0) {
                setChecking(false);
                return;
            }
            const docRef = doc(db, "meetings", code);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setExisting(true);
            } else {
                setChecking(false);
                setExisting(false);
            }
        }
        checkCode();
    }, [code]);

    const handleCreateMeeting = async (e?: FormEvent<HTMLFormElement>) => {
        try {

            if (loading || !user) return;

            const createMeeting = httpsCallable(functions, 'createMeeting');
            if (e) {
                console.log(e);
                e.preventDefault();
            }
            console.log("Creating meeting with code:", code, "and name:", name);
            const result = await createMeeting({
                code,
                name,
            } as MeetingCreateRequest);
            console.log("Meeting created:", result.data);

            router.push(`/m/${code}`);
        } catch (error) {
            console.error("Error creating meeting:", error);
        }
    };

    return (
        <div className="flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4">
            <div className={'flex justify-center items-left flex-col w-full text-foreground bg-background min-h-screen gap-4 w-3/4 lg:w-1/4 '}>
                <h2 className="text-2xl lg:text-3xl font-semibold">Uusi kokous</h2>
                <Form onSubmit={handleCreateMeeting} validationBehavior="native" >
                    <Input
                        label="Kokouksen nimi"
                        isRequired={true}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <Input
                        label="Kokouksen liittymiskoodi"
                        isRequired={true}
                        className="font-mono"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}

                        isInvalid={code.length > 0 && existing}
                        errorMessage="Koodi on jo käytössä"
                    />
                    <I18nProvider locale="fi-FI">
                        <DatePicker
                            label="Kokous alkaa"
                            hourCycle={24}
                            hideTimeZone={true}
                            onChange={(date) => setStartTime(date)}
                            value={startTime}
                            defaultValue={now(getLocalTimeZone())}
                        />
                    </I18nProvider>
                    <p>Kokouksen tekijän sähköposti: <span className="font-mono">{user?.email}</span></p>
                    <Button
                        type="submit"
                    >
                        Luo kokous
                    </Button>
                </Form>
            </div>
        </div>
    );
}
