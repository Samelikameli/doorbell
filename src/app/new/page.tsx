"use client";

//import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import { DateField, DateInputGroup, Form, Input, Button, Label, Switch, SwitchGroup, TextField } from "@heroui/react";
import { now, getLocalTimeZone, type DateValue, ZonedDateTime } from "@internationalized/date";

import { FormEvent, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
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
    const [requireLogin, setRequireLogin] = useState(false);
    const [startTime, setStartTime] = useState<ZonedDateTime | null>(now(getLocalTimeZone()));

    useEffect(() => {
        console.log("User loading state:", loading, "user:", user);
        if (!loading && user && user.isAnonymous) {
            router.push('/login?redirect=/new');
        }
    }, [user, loading, router]);

    useEffect(() => {
        // treat forbidden as taken
        setChecking(true);
        const checkCode = async () => {
            try {
                if (code.length === 0) {
                    setChecking(false);
                    return;
                }
                const docRef = doc(db, "meetings", code);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    console.log("Meeting code already exists:", code);
                    setChecking(false);
                    setExisting(true);
                } else {
                    setChecking(false);
                    setExisting(false);
                }
            } catch (err) {
                setExisting(true);
                setChecking(false);
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
                requireLogin,
                startsAt: startTime ? startTime.toDate() : null,
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
                <Form onSubmit={handleCreateMeeting} validationBehavior="native" className="flex flex-col gap-4" >
                    <TextField
                        id="name"
                        isRequired={true}
                        value={name}
                    >
                        <Label>Kokouksen nimi</Label>

                        <Input placeholder="Hallituksen syyskokous" onChange={(e) => setName(e.target.value)} />

                    </TextField>
                    <TextField
                        id="code"
                        isRequired={true}
                        className="font-mono"
                        value={code}
                        onChange={(value) => setCode(value)}>
                        <Label htmlFor="code">Kokouksen liittymiskoodi</Label>

                        <Input placeholder="esim. hallitus2024" onChange={(e) => setCode(e.target.value)} />
                        {checking && <p className="text-sm text-muted">Tarkistetaan...</p>}
                        {!checking && existing && <p className="text-sm text-red-500">Koodi on jo käytössä</p>}
                    </TextField>

                    <Switch isSelected={requireLogin} onChange={setRequireLogin}>
                        <Switch.Control>
                            <Switch.Thumb />
                        </Switch.Control>
                        <Label className="text-sm">Vaadi kirjautuminen Google-tilillä</Label>
                    </Switch>

                    <I18nProvider locale="fi-FI">
                        <DateField
                            hourCycle={24}
                            value={startTime}
                            defaultValue={now(getLocalTimeZone())}
                            onChange={(value) => setStartTime(value)}>
                            <Label>Kokous alkaa</Label>
                            <DateInputGroup>
                                <DateInputGroup.Input>
                                    {(segment) => {
                                        // render, but replace "/" with "." to match Finnish date format
                                        if (segment.text === '/') {
                                            const { text: _ignored, ...rest } = segment;

                                            return (
                                                <DateInputGroup.Segment
                                                    segment={{ ...rest, text: '.' }}
                                                />
                                            );
                                        }
                                        else {
                                            return <DateInputGroup.Segment segment={segment} />;
                                        }
                                    }}
                                </DateInputGroup.Input>
                            </DateInputGroup>
                        </DateField>
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
