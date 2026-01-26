"use client";

//import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";

import { use, useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { db } from "@/firebase";
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from "@firebase/firestore";
import { Meeting, Speech, SpeechCreateRequest, SpeechType } from "@/types";
import { Form, Select, SelectItem, useDisclosure } from "@heroui/react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { UpcomingSpeech } from "@/components/UpcomingSpeech";
import { CompletedSpeech } from "@/components/CompletedSpeech";
import { formatDate, formatDuration } from "@/utils";
export default function MeetingPage() {
    const router = useRouter();

    const { user, loading } = useUser();
    const params = useParams();

    const { isOpen: isProposalFormOpen, onOpen: onProposalFormOpen, onOpenChange: onProposalFormOpenChange } = useDisclosure();


    const descriptionRef = useRef<HTMLInputElement | null>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);

    const [code, setCode] = useState("");
    const [meeting, setMeeting] = useState<Meeting | null>(null);

    const [isMeetingAdmin, setIsMeetingAdmin] = useState(false);

    const [nowMs, setNowMs] = useState(() => Date.now());

    const [ownOngoing, setOwnOngoing] = useState(false);

    const [upcomingSpeeches, setUpcomingSpeeches] = useState<Speech[]>([]);
    const [ongoingSpeeches, setOngoingSpeeches] = useState<Speech[]>([]);
    const [completedSpeeches, setCompletedSpeeches] = useState<Speech[]>([]);

    const [userNameInput, setUserNameInput] = useState("");
    const [userName, setUserName] = useState("");

    const [speechAdminActions, setSpeechAdminActions] = useState<{ meetingCode: string, speechId: string, field: string, newValue: any, oldValue: any }[]>([]);

    const [speechTypesForMeeting, setSpeechTypesForMeeting] = useState<SpeechType[] | null>(null);

    const [speechDescriptionInput, setSpeechDescriptionInput] = useState("");
    const [speechTypeInput, setSpeechTypeInput] = useState(new Set<string | null>(null));

    useEffect(() => {
        // select the name input field on load
        requestAnimationFrame(() => {
            nameInputRef.current?.focus();
        });
    }, []);

    useEffect(() => {
        const meetingCode = params['meeting-id'] as string;
        if (meetingCode) {
            console.log("Meeting code from params:", meetingCode, "time:", new Date().toISOString());
            setCode(meetingCode);
        }
    }, [params]);

    useEffect(() => {
        console.log("Loading meeting data for code:", code, "time:", new Date().toISOString());
        if (!code) return;

        let unsubscribe: (() => void) | undefined;

        const loadMeeting = async () => {
            console.log("Fetching meeting data for code:", code, "time:", new Date().toISOString());
            try {
                const ref = doc(db, "meetings", code);
                const snap = await getDoc(ref);

                if (!snap.exists()) {
                    console.warn("Meeting does not exist:", code);
                    setMeeting(null);
                    return;
                }

                const data = snap.data();
                console.log("Fetched meeting data:", data, "time:", new Date().toISOString());
                setMeeting({
                    ...data,
                    createdAt: data.createdAt.toDate(),
                } as Meeting);

                console.log("Setting up realtime listener for meeting:", code, "time:", new Date().toISOString());
                unsubscribe = onSnapshot(
                    ref,
                    (liveSnap) => {
                        if (!liveSnap.exists()) return;
                        const liveData = liveSnap.data();
                        setMeeting({
                            ...liveData,
                            createdAt: liveData.createdAt.toDate(),
                        } as Meeting);
                    },
                    (err) => console.error("Meeting realtime error:", err)
                );
            } catch (err) {
                console.error("Meeting fetch error:", err);
                setMeeting(null);
            }
        };

        loadMeeting();

        return () => unsubscribe?.();
    }, [code]);

    useEffect(() => {
        if (meeting === null) return;

        const loadSpeechTypes = async () => {
            console.log("Fetching speech types for meeting:", meeting.code);
            try {
                const speechTypesRef = collection(db, "meetings", meeting.code, "speechTypes");
                const speechTypesSnap = await getDocs(speechTypesRef);
                const types: SpeechType[] = [];
                speechTypesSnap.forEach(doc => {
                    const data = doc.data();
                    types.push({
                        id: doc.id,
                        label: data.label,
                        priority: data.priority,
                        icon: data.icon,
                    } as SpeechType);
                });
                console.log("Fetched speech types:", types);
                // sort by priority descending
                types.sort((a, b) => b.priority - a.priority);

                setSpeechTypesForMeeting(types);
            } catch (err) {
                console.error("Error fetching speech types:", err);
                setSpeechTypesForMeeting(null);
            }
        };

        loadSpeechTypes();
    }, [meeting]);

    useEffect(() => {
        console.log("Speech types for meeting updated:", speechTypesForMeeting);
        setSpeechTypeInput(new Set<string>(speechTypesForMeeting && speechTypesForMeeting.length > 0 ? [speechTypesForMeeting[0].id] : []));
    }, [speechTypesForMeeting]);

    useEffect(() => {
        if (meeting !== null) {
            const q = query(collection(db, "meetings", meeting.code, "speeches"), where("completed", "==", false), where("started", "==", false), orderBy("priority"), orderBy("createdAt", "asc"));
            const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, querySnapshot => {
                const speechesData: Speech[] = [];
                querySnapshot.forEach(doc => {
                    const data = doc.data({ serverTimestamps: "estimate" });
                    speechesData.push({
                        ...data,
                        id: doc.id,
                        createdAt: data.createdAt.toDate(),
                        startedAt: data.startedAt ? data.startedAt.toDate() : null,
                        completedAt: data.completedAt ? data.completedAt.toDate() : null
                    } as Speech);
                });
                console.log("Fetched upcoming speeches:", speechesData);
                setUpcomingSpeeches(speechesData);
            });
            return () => unsubscribe();
        }
    }, [meeting]);

    useEffect(() => {
        if (meeting !== null) {
            const q = query(collection(db, "meetings", meeting.code, "speeches"), where("completed", "==", false), where("started", "==", true), orderBy("startedAt", "desc"));
            const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, querySnapshot => {
                const speechesData: Speech[] = [];
                querySnapshot.forEach(doc => {
                    const data = doc.data({ serverTimestamps: "estimate" });
                    speechesData.push({
                        ...data,
                        id: doc.id,
                        createdAt: data.createdAt.toDate(),
                        startedAt: data.startedAt ? data.startedAt.toDate() : null,
                        completedAt: data.completedAt ? data.completedAt.toDate() : null
                    } as Speech);
                });
                console.log("Fetched ongoing speeches:", speechesData); // there should always be only one ongoing speech
                setOngoingSpeeches(speechesData);
            });
            return () => unsubscribe();
        }
    }, [meeting]);

    useEffect(() => {
        if (meeting !== null) {
            const q = query(collection(db, "meetings", meeting.code, "speeches"), where("completed", "==", true), orderBy("completedAt", "desc"), limit(50));
            const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, querySnapshot => {
                const speechesData: Speech[] = [];
                querySnapshot.forEach(doc => {
                    const data = doc.data({ serverTimestamps: "estimate" });
                    speechesData.push({
                        ...data,
                        id: doc.id,
                        createdAt: data.createdAt.toDate(),
                        startedAt: data.startedAt ? data.startedAt.toDate() : null,
                        completedAt: data.completedAt ? data.completedAt.toDate() : null
                    } as Speech);
                });
                console.log("Fetched completed speeches:", speechesData);
                setCompletedSpeeches(speechesData);
            });
            return () => unsubscribe();
        }
    }, [meeting]);

    useEffect(() => {
        if (!userName) return;

        requestAnimationFrame(() => {
            descriptionRef.current?.focus();
            descriptionRef.current?.select();
        });
    }, [userName]);

    useEffect(() => {
        const checkAdminStatus = async () => {
            if (!loading && user && meeting) {
                const checkIfMeetingAdmin = httpsCallable(functions, 'checkIfMeetingAdmin');
                try {
                    const result = await checkIfMeetingAdmin({ meetingCode: meeting.code }) as any;
                    console.log("Admin check result:", result.data as any);
                    if (result.data && result.data.status === "OK" && result.data.isAdmin === true) {
                        setIsMeetingAdmin(true);
                    } else {
                        setIsMeetingAdmin(false);
                    }
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    setIsMeetingAdmin(false);
                }
            }
        };
        checkAdminStatus();
    }, [user, loading, meeting]);

    useEffect(() => {
        if (ongoingSpeeches.length === 0) return;

        setNowMs(Date.now());
        const id = window.setInterval(() => setNowMs(Date.now()), 100);

        return () => window.clearInterval(id);
    }, [ongoingSpeeches.length, ongoingSpeeches[0]?.id]);

    useEffect(() => {
        if (ongoingSpeeches.length === 0) {
            setOwnOngoing(false);
            return;
        }
        const ownOngoing = ongoingSpeeches[0].speakerName === userName;
        setOwnOngoing(ownOngoing);
    }, [ongoingSpeeches, userName]);


    const getSpeechTypeById = (id: string): SpeechType => {
        if (!speechTypesForMeeting) return { id: id, label: id, priority: 1000, icon: "" };
        const type = speechTypesForMeeting.find(t => t.id === id);
        return type || { id: id, label: id, priority: 1000, icon: "" };
    }

    const handleJoinWithName = (e: React.FormEvent) => {
        try {
            if (e) {
                e.preventDefault();
            }
            setUserName(userNameInput);
        } catch (error) {
            console.error("Error setting user name:", error);
        }
    }

    const handleAddSpeech = async (e: React.FormEvent) => {
        try {
            if (e) {
                e.preventDefault();
            }
            console.log("Adding speech:", speechDescriptionInput, "of type:", Array.from(speechTypeInput)[0], "by user:", userName);
            console.log("To meeting:", meeting);
            if (!meeting) return;


            const createSpeech = httpsCallable(functions, 'createSpeech');
            const result = await createSpeech({
                meetingCode: meeting.code,
                description: speechDescriptionInput,
                type: Array.from(speechTypeInput)[0], // always single select
                speakerName: userName,
            } as SpeechCreateRequest);
            console.log("Speech added:", result.data);
            // clear inputs
            setSpeechDescriptionInput("");
            if (speechTypesForMeeting && speechTypesForMeeting.length > 0) {
                setSpeechTypeInput(new Set<string | null>([speechTypesForMeeting[0].id]));
            }

            requestAnimationFrame(() => {
                descriptionRef.current?.focus();
                descriptionRef.current?.select(); // optional: highlights existing text if any
            });

        } catch (error) {
            console.error("Error adding speech:", error);
        }
    };

    const handleStartSpeech = async (speechId: string) => {
        if (!meeting) return;
        const meetingCode = meeting.code;
        try {
            const speechRef = doc(db, "meetings", meetingCode, "speeches", speechId);
            await updateDoc(speechRef, {
                started: true,
                startedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error starting speech:", error);
        }
    };

    const handleSkipSpeech = async (speechId: string) => {
        if (!meeting) return;
        const meetingCode = meeting.code;
        try {
            const speechRef = doc(db, "meetings", meetingCode, "speeches", speechId);

            setSpeechAdminActions(prev => [...prev, { meetingCode: code, speechId: speechId, field: "completed", newValue: true, oldValue: false }]);
            setSpeechAdminActions(prev => [...prev, { meetingCode: code, speechId: speechId, field: "completedAt", newValue: new Date().toISOString(), oldValue: null }]);

            await updateDoc(speechRef, {
                completed: true,
                completedAt: serverTimestamp(),
                skipped: true,
            });
        } catch (error) {
            console.error("Error skipping speech:", error);
        }
    };

    const handleCompleteSpeech = async (speechId: string) => {
        if (!meeting) return;
        const meetingCode = meeting.code;
        try {
            const speechRef = doc(db, "meetings", meetingCode, "speeches", speechId);

            setSpeechAdminActions(prev => [...prev, { meetingCode: code, speechId: speechId, field: "completed", newValue: true, oldValue: false }]);
            setSpeechAdminActions(prev => [...prev, { meetingCode: code, speechId: speechId, field: "completedAt", newValue: new Date().toISOString(), oldValue: null }]);

            await updateDoc(speechRef, {
                completed: true,
                completedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error completing speech:", error);
        }
    };

    const handleCompleteOngoingAndStartNext = async () => {
        const onGoingSpeechesLength = ongoingSpeeches.length;
        if (onGoingSpeechesLength !== 0) {
            const ongoingId = ongoingSpeeches[0].id;
            handleCompleteSpeech(ongoingId);
        }
        if (upcomingSpeeches.length > 0 && onGoingSpeechesLength === 1) {
            handleStartSpeech(upcomingSpeeches[0].id);
        }
    };

    const handleCompleteOngoingAndStartThis = async (nextSpeechId: string) => {
        if (ongoingSpeeches.length !== 0) {
            const ongoingId = ongoingSpeeches[0].id;
            handleCompleteSpeech(ongoingId);
        }

        handleStartSpeech(nextSpeechId);
    };

    // first require user to give their name before showing the meeting page
    return (
        userName === "" ?
            (
                <div className="flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4">
                    <Form onSubmit={handleJoinWithName} validationBehavior="native"
                        className={'flex justify-center items-left flex-col w-full text-foreground bg-background min-h-screen gap-4 w-3/4 lg:w-1/4'}
                    >
                        <h2 className="text-2xl lg:text-3xl font-semibold">Syötä nimesi ennen kokoukseen liittymistä</h2>
                        <Input
                            label="Nimesi"
                            placeholder="Anna nimesi"
                            value={userNameInput}
                            ref={nameInputRef}
                            isRequired
                            onChange={(e) => setUserNameInput(e.target.value)}
                        />
                        <Button
                            type="submit"
                        >
                            Jatka kokoukseen
                        </Button>
                    </Form>
                </div>
            )
            : (
                <div className="min-h-screen h-screen flex flex-col bg-background text-foreground lg:overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-border shrink-0">
                        {meeting?.code}
                    </div>

                    {/* Main: fills remaining height, does NOT scroll */}
                    <div className="flex-1 min-h-0 lg:overflow-hidden">
                        <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
                            {/* Column 1 */}
                            <div className="flex flex-col min-h-0 border border-border lg:overflow-hidden">
                                <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                                    Tulevat puheenvuorot {upcomingSpeeches.length}
                                </h3>
                                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                                    {upcomingSpeeches.map((speech, index) => (
                                        <UpcomingSpeech key={index}
                                            speech={speech}
                                            isMeetingAdmin={isMeetingAdmin}
                                            speechType={getSpeechTypeById(speech.type)}
                                            userName={userName}
                                            actions={[
                                                {
                                                    label: "Ohita",
                                                    onPress: () => handleSkipSpeech(speech.id),
                                                },
                                                {
                                                    label: "Aloita ja lopeta käynnissä oleva",
                                                    onPress: () => {
                                                        handleCompleteOngoingAndStartThis(speech.id);
                                                    },
                                                },
                                                {
                                                    label: "Aloita käynnissä olevan päälle",
                                                    onPress: () => handleStartSpeech(speech.id),
                                                },
                                            ]}
                                            skipAction={() => handleSkipSpeech(speech.id)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Column 2 */}
                            <div className={`flex flex-col min-h-0 border border-border overflow-hidden ${ownOngoing ? 'bg-green-900' : ''}`}>
                                <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                                    Käynnissä oleva puheenvuoro
                                </h3>
                                {ongoingSpeeches.length > 0 && (
                                    <div className="flex flex-row border border-border p-2 mb-2">
                                        <div className="flex flex-col">
                                            <p>Puhuja: <strong>{ongoingSpeeches[0].speakerName}</strong></p>
                                            <p>Aihe: {ongoingSpeeches[0].description}</p>
                                            <p>Kokouksen {ongoingSpeeches[0].ordinal}. puheenvuoro</p>
                                            <p className="text-sm text-muted">
                                                Alkoi {formatDate(ongoingSpeeches[0].startedAt!)}, kesto{" "}
                                                {formatDuration(
                                                    Math.max(
                                                        0,
                                                        Math.floor((nowMs - ongoingSpeeches[0].startedAt!.getTime()) / 1000)
                                                    )
                                                )}
                                            </p>
                                        </div>
                                        {isMeetingAdmin && (
                                            <div className="flex flex-col flex-grow justify-end items-center ml-4 gap-2">
                                                <Button
                                                    onPress={() => {
                                                        handleCompleteOngoingAndStartNext();
                                                    }}
                                                >Lopeta ja aloita seuraava</Button>
                                                <Button
                                                    onPress={() => handleCompleteSpeech(ongoingSpeeches[0].id)}
                                                > Lopeta</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                                    {ongoingSpeeches.slice(1).map((speech, index) => (
                                        <div key={index} className="flex flex-row border border-border p-2 mb-2">
                                            <div className="flex flex-col">

                                                <p><strong>{speech.speakerName}</strong></p>
                                                <p>{speech.description}</p>
                                                <p className="text-sm text-muted">Aika: {speech.createdAt.toLocaleString()}</p>
                                            </div>
                                            {isMeetingAdmin && (
                                                <div className="flex flex-col flex-grow justify-end items-center ml-4 gap-2">
                                                    <Button
                                                        onPress={() => {

                                                            handleCompleteSpeech(speech.id);
                                                            if (upcomingSpeeches.length > 0 && ongoingSpeeches.length === 1) {
                                                                handleStartSpeech(upcomingSpeeches[0].id);
                                                            }
                                                        }}
                                                    >Lopeta ja aloita seuraava</Button>
                                                    <Button
                                                        onPress={() => handleCompleteSpeech(speech.id)}
                                                    > Lopeta</Button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-1 flex-col min-h-0 border border-border  overflow-hidden">
                                    <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                                        Menneet puheenvuorot
                                    </h3>
                                    <div className="flex-1 min-h-0 overflow-y-auto p-3">
                                        <ul>
                                            {completedSpeeches.map((speech, index) => (
                                                <CompletedSpeech key={index}
                                                    speech={speech}
                                                    isMeetingAdmin={isMeetingAdmin}
                                                    speechType={getSpeechTypeById(speech.type)}
                                                    userName={userName}
                                                />
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Column 3 */}
                            <div className="flex flex-1 flex-col min-h-0 border border-border rounded overflow-hidden">
                                <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                                    Ehdotukset ja päätöksenteko
                                </h3>
                                {/* open modal with button */}
                                <Button className="m-4"
                                    onPress={onProposalFormOpen}>
                                    Tee ehdotus
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Footer: in flow, pinned with sticky */}
                    <div className="sticky bottom-0 px-4 py-4 border-t border-border bg-background shrink-0">
                        <div className="flex gap-2 items-center justify-center lg:flex-row">
                            <p>Nimi: {userName}</p>

                            <Form
                                onSubmit={handleAddSpeech}
                                validationBehavior="native"
                                className="flex gap-2 flex-column flex-grow lg:flex-row justify-center items-center"
                            >
                                <Input
                                    className="flex-grow"
                                    ref={descriptionRef}
                                    placeholder="Puheenvuoron kuvaus"
                                    isRequired
                                    value={speechDescriptionInput}
                                    onChange={(e) => setSpeechDescriptionInput(e.target.value)}
                                />
                                <Select
                                    className="flex-basis-48"
                                    label="Puheenvuoron tyyppi"
                                    selectedKeys={speechTypeInput as Set<string>}
                                    onSelectionChange={(keys) => setSpeechTypeInput(keys as Set<string>)}
                                >
                                    {speechTypesForMeeting && speechTypesForMeeting.map((type) => (
                                        <SelectItem key={type.id}>{type.label}</SelectItem>
                                    ))}
                                </Select>
                                <Button type="submit" className="flex-shrink-0 whitespace-nowrap">
                                    Lisää puheenvuoro
                                </Button>
                            </Form>
                        </div>
                    </div>
                    <Modal isOpen={isProposalFormOpen} onOpenChange={onProposalFormOpenChange}>
                        <ModalContent>
                            {(onClose) => (
                                <>
                                    <ModalHeader className="flex flex-col gap-1">Modal Title</ModalHeader>
                                    <ModalBody>
                                        <Form>
                                            <Input
                                                label="Ehdotuksen sisältö"
                                                placeholder="Kuvaa ehdotuksesi tässä..."
                                                isRequired
                                                autoFocus
                                            />

                                        </Form>
                                    </ModalBody>
                                    <ModalFooter>
                                        <Button color="danger" variant="light" onPress={onClose}>
                                            Close
                                        </Button>
                                        <Button color="primary" onPress={onClose}>
                                            Action
                                        </Button>
                                    </ModalFooter>
                                </>
                            )}
                        </ModalContent>
                    </Modal>
                </div>

            )
    );
}
