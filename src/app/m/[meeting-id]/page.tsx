"use client";

import { useParams } from "next/navigation";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { db } from "@/firebase";
import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, updateDoc } from "@firebase/firestore";
import { Meeting, Proposal, ProposalCloseReason, SpeechCreateRequest, SpeechType, VotingSession } from "@/types";
import { Checkbox, Form, Select, SelectItem, Tooltip, useDisclosure } from "@heroui/react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { UpcomingSpeech } from "@/components/UpcomingSpeech";
import { CompletedSpeech } from "@/components/CompletedSpeech";
import { ACTION_ICON, formatDate, formatDuration } from "@/utils";
import { ProposalCard } from "@/components/Proposal";
import { useSpeeches } from "@/hooks/useSpeeches";
import { useProposals } from "@/hooks/useProposals";
import { useRtdbPresence } from "@/hooks/useRtdbPresence";
import { useOnlineNowRtdb } from "@/hooks/useOnlineNowRtdb";

import { useVotingSessions } from "@/hooks/useVotingSessions";

export default function MeetingPage() {

    const { user, loading } = useUser();
    const params = useParams();

    const { isOpen: isProposalFormOpen, onOpen: onProposalFormOpen, onOpenChange: onProposalFormOpenChange } = useDisclosure();

    const {
        isOpen: isVotingSessionModalOpen,
        onOpen: onVotingSessionModalOpen,
        onOpenChange: onVotingSessionModalOpenChange,
    } = useDisclosure();


    const [selectedTab, setSelectedTab] = useState<"SPEECHES" | "VOTING">("SPEECHES");

    const descriptionRef = useRef<HTMLInputElement | null>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);

    const [code, setCode] = useState("");
    const [meeting, setMeeting] = useState<Meeting | null>(null);

    const [isMeetingAdmin, setIsMeetingAdmin] = useState(false);

    const [nowMs, setNowMs] = useState(() => Date.now());

    const { openProposals } = useProposals(meeting?.code);

    const { openVotingSessions, completedVotingSessions, loading: votingSessionsLoading, error: votingSessionsError } = useVotingSessions(meeting?.code);

    const [userNameInput, setUserNameInput] = useState("");
    const [userName, setUserName] = useState("");

    const [speechAdminActions, setSpeechAdminActions] = useState<{ meetingCode: string, speechId: string, field: string, newValue: any, oldValue: any }[]>([]);

    const [speechTypesForMeeting, setSpeechTypesForMeeting] = useState<SpeechType[] | null>(null);

    const [speechDescriptionInput, setSpeechDescriptionInput] = useState("");
    const [speechTypeInput, setSpeechTypeInput] = useState(new Set<string | null>(null));

    const [proposalDescriptionInput, setProposalDescriptionInput] = useState("");
    const [isBaseProposal, setIsBaseProposal] = useState(false);

    const { upcomingSpeeches, ongoingSpeeches, completedSpeeches } = useSpeeches(meeting?.code);

    const [addBlankOption, setAddBlankOption] = useState(true);

    const ownOngoing = ongoingSpeeches.length > 0 && ongoingSpeeches[0].speakerName === userName;

    const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(() => new Set());

    const rtdbEnabled = !!user && !loading && userName.trim() !== "" && !!meeting?.code;

    useRtdbPresence(meeting?.code, userName, rtdbEnabled);
    const { online } = useOnlineNowRtdb(meeting?.code, 60_000, rtdbEnabled);

    const toggleSelected = (proposalId: string, selected: boolean) => {
        setSelectedProposalIds((prev) => {
            const next = new Set(prev);
            if (selected) next.add(proposalId);
            else next.delete(proposalId);
            return next;
        });
    };

    useEffect(() => {
        const openIds = new Set(openProposals.map((p) => p.id));
        setSelectedProposalIds((prev) => {
            let changed = false;
            const next = new Set<string>();
            prev.forEach((id) => {
                if (openIds.has(id)) next.add(id);
                else changed = true;
            });
            return changed ? next : prev;
        });
    }, [openProposals]);

    useEffect(() => {
        if (!code) {
            return;
        }
        const saved = localStorage.getItem(`name:${code}`);
        if (saved) {
            setUserNameInput(saved);
        }
    }, [code]);


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
        setSpeechTypeInput(new Set(speechTypesForMeeting?.[0]?.id ? [speechTypesForMeeting[0].id] : []));
    }, [speechTypesForMeeting]);


    useEffect(() => {
        if (!userName) return;

        if (!isMeetingAdmin) {
            requestAnimationFrame(() => {
                descriptionRef.current?.focus();
                descriptionRef.current?.select();
            });
        }
    }, [userName]);
    const focusStartNext = () => {
        // Prefer a stable selector you control
        const el =
            document.querySelector<HTMLButtonElement>('[data-start-next] button') ??
            document.querySelector<HTMLButtonElement>('button#start-next-button');

        el?.focus();
    };

    useEffect(() => {
        if (!userName) return;
        if (!isMeetingAdmin) return;
        if (selectedTab !== "SPEECHES") return;

        // Only makes sense when the admin controls exist
        const hasAdminControls = ongoingSpeeches.length > 0 || ongoingSpeeches.length === 0;
        if (!hasAdminControls) return;

        // Two frames helps when UI libraries mount inner nodes after wrappers
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                focusStartNext();
            });
        });
    }, [userName, isMeetingAdmin, selectedTab, ongoingSpeeches.length]);


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
        const activeId = ongoingSpeeches[0]?.id;
        if (!activeId) return;

        setNowMs(Date.now());
        const id = window.setInterval(() => setNowMs(Date.now()), 100);
        return () => window.clearInterval(id);
    }, [ongoingSpeeches[0]?.id]);

    useEffect(() => {
        if (!userName) return;
        if (!isMeetingAdmin) return;
        if (selectedTab !== "SPEECHES") return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Enter") return;

            if (e.repeat) return;

            if ((e as any).isComposing) return;

            const target = e.target as HTMLElement | null;
            if (!target) return;

            const tag = target.tagName;

            if (
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT" ||
                target.isContentEditable ||
                target.closest('[contenteditable="true"]')
            ) {
                return;
            }

            if (target.closest("button, a, [role='button'], [role='menuitem'], [role='option']")) {
                return;
            }

            e.preventDefault();

            handleCompleteOngoingAndStartNext();
        };

        // Use capture so you receive the event even if something stops propagation
        window.addEventListener("keydown", onKeyDown, { capture: true });

        return () => {
            window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
        };
    }, [
        userName,
        isMeetingAdmin,
        selectedTab,
        ongoingSpeeches.length,
        upcomingSpeeches.length,
    ]);


    const getSpeechTypeById = (id: string): SpeechType => {
        if (!speechTypesForMeeting) return { id: id, label: id, priority: 1000, icon: "" };
        const type = speechTypesForMeeting.find(t => t.id === id);
        return type || { id: id, label: id, priority: 1000, icon: "" };
    }

    const handleJoinWithName = (e: React.FormEvent) => {
        e.preventDefault();

        const trimmed = userNameInput.trim();
        if (!trimmed) return;

        setUserName(trimmed);
        localStorage.setItem(`name:${code}`, trimmed);
    };

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
                type: Array.from(speechTypeInput)[0],
                speakerName: userName,
            } as SpeechCreateRequest);
            console.log("Speech added:", result.data);
            // clear inputs
            setSpeechDescriptionInput("");
            if (speechTypesForMeeting && speechTypesForMeeting.length > 0) {
                setSpeechTypeInput(new Set<string | null>([speechTypesForMeeting[0].id]));
            }

            if (!isMeetingAdmin) {
                requestAnimationFrame(() => {
                    descriptionRef.current?.focus();
                    descriptionRef.current?.select(); // optional: highlights existing text if any
                });
            }

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
        if (upcomingSpeeches.length > 0 && onGoingSpeechesLength <= 1) {
            handleStartSpeech(upcomingSpeeches[0].id);
        }
        requestAnimationFrame(() => {
            document.getElementById("start-next-button")?.focus();
        });
    };

    const handleCompleteOngoingAndStartThis = async (nextSpeechId: string) => {
        if (ongoingSpeeches.length !== 0) {
            const ongoingId = ongoingSpeeches[0].id;
            handleCompleteSpeech(ongoingId);
        }

        handleStartSpeech(nextSpeechId);
    };

    const isSupportedByMe = (proposal: Proposal) => {
        if (!user?.uid) return false;
        return (proposal.supporterUids ?? []).includes(user.uid);
    };

    const handleAddProposal = async (onClose: () => void) => {
        try {
            if (!meeting) return;
            console.log("Adding proposal:", proposalDescriptionInput, "by user:", userName);
            const addProposal = httpsCallable(functions, 'createProposal');
            const result = await addProposal({
                meetingCode: meeting.code,
                description: proposalDescriptionInput,
                proposerName: userName,
                baseProposal: isBaseProposal,
            });

            console.log("Proposal added:", result.data);
            // clear input
            setProposalDescriptionInput("");
            onClose();
        } catch (error) {
            console.error("Error adding proposal:", error);
        }
    }

    const handleCreateVotingSession = async () => {
        // take selected proposals and create a voting session with them
        const proposalIds = Array.from(selectedProposalIds);
        if (proposalIds.length === 0) return;
        try {
            if (!meeting) return;
            console.log("Creating voting session for proposals:", proposalIds, "by user:", userName);
            const createVotingSession = httpsCallable(functions, 'createVotingSession');
            const result = await createVotingSession({
                meetingCode: meeting.code,
                proposalIds,
            });

            console.log("Voting session created:", result.data);
            setSelectedProposalIds(new Set());
            setAddBlankOption(true);
        } catch (error) {
            console.error("Error creating voting session:", error);
        }
    };

    const handleCloseProposal = async (proposalId: string, closedAs: ProposalCloseReason) => {
        if (!meeting) return;
        try {
            const fn = httpsCallable(functions, "closeProposal");
            await fn({ meetingCode: meeting.code, proposalId, closedAs });
        } catch (e) {
            console.error("Error closing proposal:", e);
        }
    };

    const handleEditProposal = async (proposalId: string, newDescription: string) => {
        if (!meeting) return;

        try {
            const fn = httpsCallable(functions, "editProposal");
            await fn({
                meetingCode: meeting.code,
                proposalId,
                description: newDescription,
            });
        } catch (e) {
            console.error("Error editing proposal:", e);
        }
    };

    const handleCloseVotingSession = async (votingSessionId: string) => {
        if (!meeting) return;
        try {
            const fn = httpsCallable(functions, "closeVotingSession");
            await fn({ meetingCode: meeting.code, votingSessionId });
        } catch (e) {
            console.error("Error closing voting session:", e);
        }
    };


    const handleSetSupport = async (proposalId: string, isSupported: boolean) => {
        // add or retract support for a proposal depending on isSupported
        if (!meeting) return;
        try {
            const fn = httpsCallable(functions, "setProposalSupport");
            await fn({
                meetingCode: meeting.code,
                proposalId,
                supporterName: userName,
                addSupport: !isSupported,
            });
        } catch (e) {
            console.error("Error toggling support:", e);
        }
    };

    const handleCastVote = async (votingSessionId: string, voteOptionId: string) => {
        if (!meeting) return;
        if (!user) return; // should not happen after anonymous auth, but safe
        if (!userName) return; // keep requiring name for anonymous display/presence

        try {
            const fn = httpsCallable(functions, "castVote");

            await fn({
                meetingCode: meeting.code,
                votingSessionId,
                voteOptionId,
                voterName: userName,
            });
        } catch (e: any) {
            console.error("Error casting vote:", e);
        }
    };

    const handleCloseProposalsFromVoteResults = async (session: VotingSession) => {
        if (!meeting) return;

        // calculate winning proposal id from votes
        const proposalVotesCount: Record<string, number> = {};
        session.voteOptions.forEach(option => {
            if (option.type === "PROPOSAL") {
                proposalVotesCount[option.proposalId] = 0;
            }
        });
        session.votes.forEach(vote => {
            const option = session.voteOptions.find(o => o.id === vote.voteOptionId);
            if (option?.type === "PROPOSAL") {
                proposalVotesCount[option.proposalId] = (proposalVotesCount[option.proposalId] || 0) + 1;
            }
        });

        // find proposal id with most votes
        let winningProposalId: string | null = null;
        let maxVotes = -1;
        for (const proposalId in proposalVotesCount) {
            if (proposalVotesCount[proposalId] > maxVotes) {
                maxVotes = proposalVotesCount[proposalId];
                winningProposalId = proposalId;
            }
        }

        // find ties if any
        const tiedProposalIds = Object.keys(proposalVotesCount).filter(pid => proposalVotesCount[pid] === maxVotes);
        if (tiedProposalIds.length > 1) {
            console.log("Voting session resulted in a tie between proposals:", tiedProposalIds);
            return;
        }

        if (!winningProposalId) {
            console.log("No winning proposal found for voting session:", session.votingSessionId);
            return;
        }

        // now we have the winning proposal id, we can close it
        try {
            const fn = httpsCallable(functions, "closeProposal");
            await fn({
                meetingCode: meeting.code,
                proposalId: winningProposalId,
                closedAs: "ACCEPTED" as ProposalCloseReason,
            });
        } catch (e) {
            console.error("Error closing winning proposal:", e);
        }
        // close losing proposals as well
        const losingProposalIds = Object.keys(proposalVotesCount).filter(pid => pid !== winningProposalId);
        for (const proposalId of losingProposalIds) {
            try {
                const fn = httpsCallable(functions, "closeProposal");
                await fn({
                    meetingCode: meeting.code,
                    proposalId,
                    closedAs: "REJECTED" as ProposalCloseReason,
                });
            } catch (e) {
                console.error("Error closing losing proposal:", e);
            }
        }
    };

    const loginScreen = (
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
    );

    const upcomingSpeechesColumn = (
        <div className="flex flex-col min-h-0 border border-border lg:overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                Tulevat puheenvuorot {upcomingSpeeches.length}
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {upcomingSpeeches.map((speech, index) => (
                    <UpcomingSpeech
                        key={speech.id}
                        speech={speech}
                        next={index === 0}
                        isMeetingAdmin={isMeetingAdmin}
                        speechType={getSpeechTypeById(speech.type)}
                        userName={userName}
                        actions={[
                            { label: "Ohita", onPress: () => handleSkipSpeech(speech.id), icon: "SKIP" },
                            { label: "Aloita ja tauota nykyinen", onPress: () => handleStartSpeech(speech.id), icon: "PLAY_PAUSE" },
                            {
                                label: "Aloita ja lopeta nykyinen",
                                onPress: () => handleCompleteOngoingAndStartThis(speech.id),
                                icon: "NEXT",
                            },
                        ]}
                        skipAction={() => handleSkipSpeech(speech.id)}
                    />
                ))}
            </div>
        </div>
    );

    const onlineNow = (
        <div className="p-3 border border-border rounded">
            <div className="font-semibold">Online ({online.length})</div>
            <ul className="mt-2 space-y-1 text-sm">
                {online.map((u) => (
                    <li key={u.name}>
                        {u.name}{" "}
                    </li>
                ))}
            </ul>
        </div>
    )

    const votingColumn = (
        <div className="flex flex-1 flex-col min-h-0 border border-border rounded overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">Äänestys</h3>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-6">
                {/* OPEN SESSIONS */}
                <div>
                    <h4 className="text-lg font-semibold mb-2">Avoimet</h4>

                    {openVotingSessions.map((session) => {
                        const voterKey = user?.uid ?? "";
                        const myVote = session.votes.find((v) => v.voterUid === voterKey);

                        const hasVoted = !!myVote;

                        return (
                            <div key={session.votingSessionId} className="border border-border rounded p-3 mb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm text-muted">Aloitettu {formatDate(session.createdAt)}</p>

                                    {isMeetingAdmin && (
                                        <Button
                                            size="sm"
                                            color="danger"
                                            variant="light"
                                            onPress={() => handleCloseVotingSession(session.votingSessionId)}
                                        >
                                            Sulje äänestys
                                        </Button>
                                    )}
                                </div>

                                {hasVoted && <p className="text-sm mt-2">Olet jo äänestänyt.</p>}

                                <ul className="mt-2 space-y-2">
                                    {session.voteOptions.map((option) => {
                                        const label =
                                            option.type === "PROPOSAL" ? option.proposal.description : option.label ?? option.vote;

                                        const selected = myVote?.voteOptionId === option.id;

                                        return (
                                            <li key={option.id} className="flex items-center justify-between gap-3">
                                                <span className={selected ? "font-semibold" : ""}>{label}</span>
                                                <Button
                                                    size="sm"
                                                    variant={selected ? "solid" : "light"}
                                                    isDisabled={hasVoted}
                                                    onPress={() => handleCastVote(session.votingSessionId, option.id)}
                                                >
                                                    {selected ? "Valittu" : "Äänestä"}
                                                </Button>
                                            </li>
                                        );
                                    })}
                                </ul>

                                <div className="mt-3 text-sm opacity-70">Ääniä: {session.votes.length}</div>
                            </div>
                        );
                    })}

                    {openVotingSessions.length === 0 && <p className="text-sm opacity-70">Ei avoimia äänestyksiä.</p>}
                </div>

                {/* CLOSED SESSIONS + RESULTS */}
                <div>
                    <h4 className="text-lg font-semibold mb-2">Suljetut</h4>

                    {completedVotingSessions.map((session) => {
                        // results
                        const counts = new Map<string, number>();
                        for (const v of session.votes) counts.set(v.voteOptionId, (counts.get(v.voteOptionId) ?? 0) + 1);

                        const optionsWithCounts = session.voteOptions
                            .map((o) => ({
                                option: o,
                                count: counts.get(o.id) ?? 0,
                            }))
                            .sort((a, b) => b.count - a.count);

                        const votesByOption = new Map<string, { voterUid: string, voterName: string }[]>();
                        for (const v of session.votes) {
                            const arr = votesByOption.get(v.voteOptionId) ?? [];
                            arr.push({ voterUid: v.voterUid, voterName: v.voterName });
                            votesByOption.set(v.voteOptionId, arr);
                        }

                        return (
                            <div key={session.votingSessionId} className="border border-border rounded p-3 mb-3">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm text-muted">Suljettu, aloitettu {formatDate(session.createdAt)}</p>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            onPress={() => handleCloseProposalsFromVoteResults(session)}
                                        >
                                            Sulje ehdotukset: voittanut hyväksyttynä, hävinneet hylättynä
                                        </Button>
                                        <div className="text-sm opacity-70">Ääniä: {session.votes.length}</div>
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <div className="text-sm font-semibold mb-2">Tulokset</div>
                                    <ul className="space-y-2">
                                        {optionsWithCounts.map(({ option, count }) => {
                                            const label =
                                                option.type === "PROPOSAL" ? option.proposal.description : option.label ?? option.vote;

                                            const voters = votesByOption.get(option.id) ?? [];

                                            return (
                                                <li key={option.id} className="border border-border rounded p-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-medium">{label}</span>
                                                        <span className="text-sm opacity-70">{count}</span>
                                                    </div>

                                                    {/* Votes are public after closed */}
                                                    {voters.length > 0 && (
                                                        <div className="mt-2 text-sm opacity-80">
                                                            <div className="opacity-70">Äänestäjät:</div>
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {voters.map((x, idx) => (
                                                                    <span key={`${option.id}:${x.voterName}:${idx}`} className="px-2 py-0.5 border border-border rounded">
                                                                        {x.voterName}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        );
                    })}

                    {completedVotingSessions.length === 0 && <p className="text-sm opacity-70">Ei suljettuja äänestyksiä.</p>}
                </div>

                {votingSessionsLoading && <p>Ladataan äänestysistuntoja...</p>}
                {votingSessionsError && <pre>{String(votingSessionsError.message)}</pre>}
            </div>
        </div>
    );

    const proposalsColumn = (
        <div className="flex flex-1 flex-col min-h-0 border border-border rounded overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                Ehdotukset ja päätöksenteko
            </h3>
            {/* open modal with button */}
            <Button className="m-4"
                onPress={onProposalFormOpen}
                startContent={<Image src={ACTION_ICON["PROPOSAL"]} alt="Lisää" width={24} height={24} />}

            >
                Tee ehdotus
            </Button>
            {/* List of open proposals */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {openProposals.map((proposal) => (
                    <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        isMeetingAdmin={isMeetingAdmin}
                        selectedForDecision={selectedProposalIds.has(proposal.id)}
                        onToggleSelectedForDecision={toggleSelected}
                        onSupportToggle={() => { handleSetSupport(proposal.id, isSupportedByMe(proposal)) }}
                        user={user}
                        supportCount={proposal.supporterUids?.length ?? 0}
                        onClose={handleCloseProposal}
                        onEdit={handleEditProposal}
                    />

                ))}
            </div>
            {isMeetingAdmin && selectedProposalIds.size > 0 && (
                <div className="p-3 border-t border-border">
                    <Button onPress={onVotingSessionModalOpen}>
                        Avaa äänestys näistä ehdotuksista ({selectedProposalIds.size})
                    </Button>
                </div>
            )}
        </div>
    );

    const ongoingAndCompletedSpeechesColumn = (
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
                                id="start-next-button"
                            >Lopeta ja aloita seuraava</Button>
                            <Button
                                onPress={() => handleCompleteSpeech(ongoingSpeeches[0].id)}
                            > Lopeta</Button>
                        </div>
                    )}
                </div>
            )}
            {ongoingSpeeches.length === 0 && isMeetingAdmin && (
                <Tooltip content="Ei käynnissä olevaa puheenvuoroa. Voit aloittaa seuraavan tästä" placement="top">
                    <Button id="start-next-button" className="m-4" onPress={() => {
                        if (upcomingSpeeches.length > 0) {
                            handleStartSpeech(upcomingSpeeches[0].id);
                        }
                    }}
                        isDisabled={upcomingSpeeches.length === 0}
                        startContent={<Image src={ACTION_ICON["NEXT"]} alt="Aloita" width={24} height={24} />}
                    >
                        Aloita seuraava puheenvuoro
                    </Button>
                </Tooltip>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {ongoingSpeeches.slice(1).map((speech) => (
                    <div key={speech.id} className="flex flex-row border border-border p-2 mb-2">
                        <div className="flex flex-col">

                            <p><strong>{speech.speakerName}</strong></p>
                            <p>{speech.description}</p>
                            <p className="text-sm text-muted">Aika: {speech.createdAt.toLocaleString()}</p>
                        </div>
                        {isMeetingAdmin && (
                            <div className="flex flex-col flex-grow justify-end items-center ml-4 gap-2">
                                <Tooltip content="Lopeta ja aloita seuraava" placement="left">
                                    <Button isIconOnly onPress={() => handleCompleteOngoingAndStartNext()}>
                                        <Image src={ACTION_ICON["NEXT"]} alt="Lopeta ja aloita seuraava" width={24} height={24} />
                                    </Button>
                                </Tooltip>
                                <Tooltip content="Lopeta" placement="left"><Button isIconOnly onPress={() => handleCompleteSpeech(ongoingSpeeches[0].id)}>
                                    <Image src={ACTION_ICON["STOP"]} alt="Lopeta" width={24} height={24} />
                                </Button>
                                </Tooltip>
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
                        {completedSpeeches.map((speech) => (
                            <CompletedSpeech key={speech.id}
                                speech={speech}
                                speechType={getSpeechTypeById(speech.type)}
                            />
                        ))}
                    </ul>
                </div>
            </div>
        </div>

    );

    const speechesTab = <div className="flex-1 min-h-0 lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
            {upcomingSpeechesColumn}
            {ongoingAndCompletedSpeechesColumn}
            {proposalsColumn}
        </div>
    </div>;

    const votingTab = <div className="flex-1 min-h-0 lg:overflow-hidden">
        {votingColumn}
    </div>;

    const content = selectedTab === "SPEECHES" ? speechesTab : votingTab;

    // first require user to give their name before showing the meeting page
    return (
        userName === "" ? loginScreen
            : (
                <div className="min-h-screen h-screen flex flex-col bg-background text-foreground lg:overflow-hidden">
                    {/* Header */}
                    <div className="flex flex-row px-4 py-3 border-b border-border shrink-0 content-center lg:items-center lg:justify-between gap-4">
                        <div>
                            {meeting?.name} <span className="font-mono">{meeting?.code}</span>
                        </div>
                        {onlineNow}
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                            {/** Tab selection */}
                            <div className="flex gap-2 mt-2">
                                <Button
                                    variant={selectedTab === "SPEECHES" ? "solid" : "light"}
                                    onPress={() => setSelectedTab("SPEECHES")}
                                >
                                    Puheenvuorot
                                </Button>
                                <Button
                                    variant={selectedTab === "VOTING" ? "solid" : "light"}
                                    onPress={() => setSelectedTab("VOTING")}
                                >
                                    Äänestys
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Main: fills remaining height, does NOT scroll */}

                    {content}

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
                                    <ModalHeader className="flex flex-col gap-1">Uusi ehdotus</ModalHeader>
                                    <ModalBody>
                                        <Form
                                            id="proposalForm"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                handleAddProposal(onClose);
                                            }}
                                        >
                                            {isMeetingAdmin && (
                                                <Checkbox
                                                    isSelected={isBaseProposal}
                                                    onValueChange={(selected) => setIsBaseProposal(selected)}
                                                >
                                                    Pohjaesitys
                                                </Checkbox>
                                            )}
                                            <Input
                                                label="Ehdotuksen sisältö"
                                                placeholder="Kuvaa ehdotuksesi tässä..."
                                                value={proposalDescriptionInput}
                                                onChange={(e) => setProposalDescriptionInput(e.target.value)}
                                                isRequired
                                                autoFocus
                                            />

                                        </Form>
                                    </ModalBody>
                                    <ModalFooter>
                                        <Button color="danger" variant="light" onPress={onClose}>
                                            Close
                                        </Button>

                                        <Button color="primary" type="submit" form="proposalForm">
                                            Lisää
                                        </Button>
                                    </ModalFooter>
                                </>
                            )}
                        </ModalContent>
                    </Modal>
                    <Modal isOpen={isVotingSessionModalOpen} onOpenChange={onVotingSessionModalOpenChange}>
                        <ModalContent>
                            {(onClose) => (
                                <>
                                    <ModalHeader className="flex flex-col gap-1">Avaa äänestys</ModalHeader>
                                    <ModalBody>
                                        <p>
                                            Olet avaamassa äänestyksen valituista ehdotuksista ({selectedProposalIds.size} kpl).
                                        </p>
                                        <p className="text-sm opacity-70">
                                            Äänestys avautuu heti kaikille kokouksen osallistujille.
                                        </p>
                                        <Checkbox
                                            isSelected={addBlankOption}
                                            onValueChange={(selected) => setAddBlankOption(selected)}
                                        >
                                            Lisää tyhjä vaihtoehto
                                        </Checkbox>
                                        <div>
                                            {Array.from(selectedProposalIds).map((id) => {
                                                const proposal = openProposals.find((p) => p.id === id);
                                                if (!proposal) return null;

                                                return (
                                                    <div key={id} className="px-2 py-1 border border-border rounded mb-1">
                                                        {proposal.description}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </ModalBody>
                                    <ModalFooter>
                                        <Button variant="light" onPress={onClose}>
                                            Peruuta
                                        </Button>
                                        <Button
                                            color="primary"
                                            onPress={async () => {
                                                await handleCreateVotingSession();
                                                onClose();
                                            }}
                                        >
                                            Avaa äänestys
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
