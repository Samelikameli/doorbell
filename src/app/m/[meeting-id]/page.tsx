"use client";

import { useParams } from "next/navigation";
import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import { db } from "@/firebase";
import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, updateDoc } from "@firebase/firestore";
import { Meeting, Proposal, ProposalCloseReason, SpeechCreateRequest, SpeechType, VotingSession } from "@/types";
import { Input, Checkbox, Form, Select, Tooltip, Modal, Label, Button, ListBox, ListBoxItem, TextField, Surface, Description, Alert, RadioGroup, Radio, FieldError } from "@heroui/react";
import { functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { UpcomingSpeechCard } from "@/components/UpcomingSpeechCard";
import { CompletedSpeechCard } from "@/components/CompletedSpeechCard";
import { ACTION_ICON, checkIfProposalsCanBeClosedFromVotingResults, formatDate, formatDuration, SPEECH_TYPE_ICON } from "@/utils";
import { OpenProposalCard } from "@/components/OpenProposalCard";
import { useSpeeches } from "@/hooks/useSpeeches";
import { useProposals } from "@/hooks/useProposals";
import { useRtdbPresence } from "@/hooks/useRtdbPresence";
import { useOnlineNowRtdb } from "@/hooks/useOnlineNowRtdb";
import { useRouter } from "next/navigation";

import { useVotingSessions } from "@/hooks/useVotingSessions";
import { ClosedProposalCard } from "@/components/ClosedProposalCard";
import { OpenVotingSessionCard } from "@/components/OpenVotingSessionCard";
import { ClosedVotingSessionCard } from "@/components/ClosedVotingSessionCard";
import { useMeeting } from "@/hooks/useMeeting";
import { useSpeechTypes } from "@/hooks/useSpeechTypes";
import { useMeetingAdmin } from "@/hooks/useMeetingAdmin";

export default function MeetingPage() {

    const { user, loading: userLoading } = useUser();
    const router = useRouter();
    const params = useParams();

    const [isProposalFormOpen, setIsProposalFormOpen] = useState(false);
    const [isVotingSessionModalOpen, setIsVotingSessionModalOpen] = useState(false);
    const [isQuickVoteOpen, setIsQuickVoteOpen] = useState(false);

    const [quickVoteText, setQuickVoteText] = useState("");
    const [quickVoteSaving, setQuickVoteSaving] = useState(false);
    const [quickVoteError, setQuickVoteError] = useState<string>("");

    const [selectedTab, setSelectedTab] = useState<"SPEECHES" | "VOTING">("SPEECHES");

    const descriptionRef = useRef<HTMLInputElement | null>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);

    const meetingCode = params["meeting-id"] as string | undefined;
    const { meeting, loading: meetingLoading, error: meetingError, exists } = useMeeting(meetingCode);
    const { speechTypes, defaultSpeechTypeId, getSpeechTypeById } = useSpeechTypes(meeting?.code);


    const { isAdmin: isMeetingAdmin, loading: adminLoading } = useMeetingAdmin(meeting?.code, user, userLoading);

    const [nowMs, setNowMs] = useState(() => Date.now());

    const { openProposals, acceptedProposals, rejectedProposals } = useProposals(meeting?.code);

    const { openVotingSessions, completedVotingSessions, loading: votingSessionsLoading, error: votingSessionsError } = useVotingSessions(meeting?.code);

    const [userNameInput, setUserNameInput] = useState("");
    const [userName, setUserName] = useState("");

    const [speechAdminActions, setSpeechAdminActions] = useState<{ meetingCode: string, speechId: string, field: string, newValue: any, oldValue: any }[]>([]);

    const [speechDescriptionInput, setSpeechDescriptionInput] = useState("");
    const [speechTypeInput, setSpeechTypeInput] = useState<string | null>(null);

    const [proposalDescriptionInput, setProposalDescriptionInput] = useState("");
    const [isBaseProposal, setIsBaseProposal] = useState(false);

    const { upcomingSpeeches, ongoingSpeeches, completedSpeeches } = useSpeeches(meeting?.code);

    const [createVotingSessionPublicity, setCreateVotingSessionPublicity] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
    const [addBlankOption, setAddBlankOption] = useState(true);

    const ownOngoing = ongoingSpeeches.length > 0 && ongoingSpeeches[0].speakerName === userName;

    const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(() => new Set());

    const rtdbEnabled = !!user && !userLoading && userName.trim() !== "" && !!meeting?.code;

    useRtdbPresence(meeting?.code, userName, rtdbEnabled);
    const { online } = useOnlineNowRtdb(meeting?.code, 60_000, rtdbEnabled);

    useEffect(() => {
        console.log("User loading state:", userLoading, "user:", user, "meeting:", meeting?.requireLogin);
        if (!userLoading && user && user.isAnonymous && meeting && meeting.requireLogin) {
            router.push('/login?redirect=/new');
        }
    }, [user, userLoading, router, meeting]);

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
        if (!meetingCode) {
            return;
        }
        const saved = localStorage.getItem(`name:${meetingCode}`);
        if (saved) {
            setUserNameInput(saved);
        }
    }, [meetingCode]);


    useEffect(() => {
        // select the name input field on load
        requestAnimationFrame(() => {
            nameInputRef.current?.focus();
        });
    }, []);

    useEffect(() => {
        setSpeechTypeInput(speechTypes?.[0]?.id ?? null);
    }, [speechTypes]);

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

    const handleJoinWithName = (e: React.FormEvent) => {
        e.preventDefault();

        const trimmed = userNameInput.trim();
        if (!trimmed) return;

        setUserName(trimmed);

        if (meetingCode) {
            localStorage.setItem(`name:${meetingCode}`, trimmed);
        }
    };


    const handleAddSpeech = async (e: React.FormEvent) => {
        try {
            if (e) {
                e.preventDefault();
            }
            console.log("Adding speech:", speechDescriptionInput, "of type:", speechTypeInput, "by user:", userName);
            console.log("To meeting:", meeting);
            if (!meeting) return;


            const createSpeech = httpsCallable(functions, 'createSpeech');
            const result = await createSpeech({
                meetingCode: meeting.code,
                description: speechDescriptionInput,
                type: speechTypeInput,
                speakerName: userName,
            } as SpeechCreateRequest);
            console.log("Speech added:", result.data);
            // clear inputs
            setSpeechDescriptionInput("");
            if (speechTypes && speechTypes.length > 0) {
                setSpeechTypeInput(speechTypes[0].id ?? null);
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

            setSpeechAdminActions(prev => [...prev, { meetingCode: meetingCode, speechId: speechId, field: "completed", newValue: true, oldValue: false }]);
            setSpeechAdminActions(prev => [...prev, { meetingCode: meetingCode, speechId: speechId, field: "completedAt", newValue: new Date().toISOString(), oldValue: null }]);

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

            setSpeechAdminActions(prev => [...prev, { meetingCode: meetingCode, speechId: speechId, field: "completed", newValue: true, oldValue: false }]);
            setSpeechAdminActions(prev => [...prev, { meetingCode: meetingCode, speechId: speechId, field: "completedAt", newValue: new Date().toISOString(), oldValue: null }]);

            await updateDoc(speechRef, {
                completed: true,
                completedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error completing speech:", error);
        }
    };

    const handleCreateQuickYesNoVote = async () => {
        if (!meeting) return;
        const text = quickVoteText.trim();
        if (!text) return;

        setQuickVoteSaving(true);
        setQuickVoteError("");

        try {
            const createProposalFn = httpsCallable(functions, "createProposal");
            const res1: any = await createProposalFn({
                meetingCode: meeting.code,
                description: text,
                proposerName: userName,
                baseProposal: false,
            });

            const proposalId = res1?.data?.proposalId as string | undefined;
            if (!proposalId) {
                throw new Error("createProposal did not return proposalId");
            }

            const createVotingSessionFn = httpsCallable(functions, "createVotingSession");
            await createVotingSessionFn({
                meetingCode: meeting.code,
                proposalIds: [proposalId],
            });

            setQuickVoteText("");
            setSelectedTab("VOTING");
        } catch (e: any) {
            setQuickVoteError(String(e?.message ?? "Failed to create quick vote"));
        } finally {
            setQuickVoteSaving(false);
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

    const handleAddProposal = async () => {
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
                addBlankOption,
                votePublicity: createVotingSessionPublicity,
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
        if (session.type === "FOR-AGAINST-ABSTAIN") {
            console.log("Checking FOR-AGAINST-ABSTAIN session for closing proposals, session:", session);
            if (session.proposalIds.length !== 1) {
                console.warn("FOR-AGAINST-ABSTAIN session has more than one proposal, cannot close:", session);
                return;
            }
            const proposalId = session.proposalIds[0];

            const votesFor = session.votes.filter(v => {
                const option = session.voteOptions.find(o => o.id === v.voteOptionId);
                return option?.type === "FOR-AGAINST-ABSTAIN" && option.vote === "FOR";
            }).length;
            const votesAgainst = session.votes.filter(v => {
                const option = session.voteOptions.find(o => o.id === v.voteOptionId);
                return option?.type === "FOR-AGAINST-ABSTAIN" && option.vote === "AGAINST";
            }).length;

            if (votesFor === votesAgainst) {
                console.log("No winning option in FOR-AGAINST-ABSTAIN session due to tie, session:", session);
                return;
            }

            const closedAs: ProposalCloseReason = votesFor > votesAgainst ? "ACCEPTED" : "REJECTED";
            try {
                const fn = httpsCallable(functions, "closeProposal");
                await fn({
                    meetingCode: meeting.code,
                    proposalId,
                    closedAs,
                });
            } catch (e) {
                console.error("Error closing proposal based on FOR-AGAINST-ABSTAIN session:", e);
            }
        }
        else if (session.type === "ONE-OF-PROPOSALS") {

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
        }
    };
    const loginScreen = (
        <div className="flex justify-center items-center flex-col w-full text-foreground bg-background h-full gap-4">
            <Form onSubmit={handleJoinWithName} validationBehavior="native"
                className={'flex justify-center items-left flex-col w-full text-foreground bg-background h-dhv gap-4 w-3/4 lg:w-1/4'}
            >
                <h2 className="text-2xl lg:text-3xl font-semibold">Syötä nimesi ennen kokoukseen liittymistä</h2>
                <Label htmlFor="user-name-input">Nimi</Label>
                <Input
                    id="user-name-input"
                    placeholder="Anna nimesi"
                    value={userNameInput}
                    ref={nameInputRef}
                    required
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
        <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                Tulevat puheenvuorot ({upcomingSpeeches.length})
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
                {upcomingSpeeches.map((speech, index) => (
                    <UpcomingSpeechCard
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
        <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">Äänestys</h3>

            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                <div>
                    <h4 className="text-lg font-semibold mb-2">Käynnissä olevat äänestykset</h4>
                    {openVotingSessions.map((session) => (
                        <OpenVotingSessionCard
                            key={session.votingSessionId}
                            session={session}
                            isMeetingAdmin={isMeetingAdmin}
                            userUid={user?.uid}
                            onCastVote={handleCastVote}
                            onClose={handleCloseVotingSession}
                        />
                    ))}

                    {openVotingSessions.length === 0 && <p className="text-sm opacity-70">Ei käynnissä olevia äänestyksiä.</p>}
                </div>

                <div>
                    <h4 className="text-lg font-semibold mb-2">Lopetetut äänestykset</h4>

                    {completedVotingSessions.map((session) => (
                        <ClosedVotingSessionCard
                            key={session.votingSessionId}
                            session={session}
                            isMeetingAdmin={isMeetingAdmin}
                            closeProposalsFromVoteResults={handleCloseProposalsFromVoteResults}
                            proposalsCanBeClosedFromVotingResults={checkIfProposalsCanBeClosedFromVotingResults(session, openProposals)}
                        />
                    ))}

                    {completedVotingSessions.length === 0 && <p className="text-sm opacity-70">Ei suljettuja äänestyksiä.</p>}
                </div>

                {votingSessionsLoading && <p>Ladataan äänestysistuntoja...</p>}
                {votingSessionsError && <pre>{String(votingSessionsError.message)}</pre>}
            </div>
        </div>
    );

    const proposalsColumn = (
        <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                Avoimet ehdotukset ({openProposals.length})
            </h3>

            <Button className="m-4" variant="secondary"
                onPress={() => setIsProposalFormOpen(true)}
            >
                <Image src={ACTION_ICON["PROPOSAL"]} alt="Lisää" width={24} height={24} />
                Tee ehdotus
            </Button>

            <div
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3"
                tabIndex={-1}
                style={{ overflowAnchor: "none" }}
            >

                {openProposals.map((proposal) => (
                    <OpenProposalCard
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
            {isMeetingAdmin && (
                <div className="p-3 border-t border-border min-h-[72px] flex items-center">
                    {selectedProposalIds.size > 0 ? (
                        <Button onPress={() => setIsVotingSessionModalOpen(true)} variant="secondary">
                            Avaa äänestys näistä ehdotuksista ({selectedProposalIds.size})
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            onPress={() => setIsQuickVoteOpen(true)}
                        >
                            Uusi kyllä/ei -pikaäänestys
                        </Button>
                    )}
                </div>
            )}
        </div>
    );

    const ongoingAndCompletedSpeechesColumn = (
        <div className={`flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden ${ownOngoing ? 'bg-green-900' : ''}`}>
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
                <Tooltip>
                    <Button id="start-next-button" variant="outline" className="m-4" onPress={() => {
                        if (upcomingSpeeches.length > 0) {
                            handleStartSpeech(upcomingSpeeches[0].id);
                        }
                    }}
                        isDisabled={upcomingSpeeches.length === 0}>
                        <Image src={ACTION_ICON["NEXT"]} alt="Aloita" width={24} height={24} />
                        Aloita seuraava puheenvuoro
                    </Button>
                    <Tooltip.Content placement="top">
                        Ei käynnissä olevaa puheenvuoroa. Voit aloittaa seuraavan tästä
                    </Tooltip.Content>
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
                                <Tooltip>
                                    <Button isIconOnly onPress={() => handleCompleteOngoingAndStartNext()}>
                                        <Image src={ACTION_ICON["NEXT"]} alt="Lopeta ja aloita seuraava" width={24} height={24} />
                                    </Button>
                                    <Tooltip.Content placement="left">
                                        Lopeta ja aloita seuraava
                                    </Tooltip.Content>
                                </Tooltip>
                                <Tooltip><Button isIconOnly onPress={() => handleCompleteSpeech(ongoingSpeeches[0].id)} variant="outline">
                                    <Image src={ACTION_ICON["STOP"]} alt="Lopeta" width={24} height={24} />
                                </Button>
                                    <Tooltip.Content placement="left">
                                        Lopeta tämä puheenvuoro
                                    </Tooltip.Content>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <div className="flex flex-1 flex-col min-h-0 border border-border  overflow-hidden">
                <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                    Menneet puheenvuorot ({completedSpeeches.length})
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    <ul>
                        {completedSpeeches.map((speech) => (
                            <CompletedSpeechCard key={speech.id}
                                speech={speech}
                                speechType={getSpeechTypeById(speech.type)}
                            />
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );

    const closedProposalsColumn = (
        <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
            <h3 className="text-xl font-semibold p-3 border-b border-border shrink-0">
                Hyväksytyt ehdotukset ({acceptedProposals.length})
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
                {acceptedProposals.map((proposal) => (
                    <ClosedProposalCard key={proposal.id} proposal={proposal} isMeetingAdmin={isMeetingAdmin} />
                ))}
            </div>
            <h3 className="text-xl font-semibold p-3 border-b border-t border-border shrink-0">
                Hylätyt ehdotukset ({rejectedProposals.length})
            </h3>
            <div className="flex flex-1 min-h-0 border border-border overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    {rejectedProposals.map((proposal) => (
                        <ClosedProposalCard key={proposal.id} proposal={proposal} isMeetingAdmin={isMeetingAdmin} />
                    ))}
                </div>
            </div>
        </div>
    );

    const speechesTab = (
        <div className="flex h-full min-h-0 overflow-hidden">
            {upcomingSpeechesColumn}
            {ongoingAndCompletedSpeechesColumn}
            {proposalsColumn}
        </div>
    );


    const votingTab = (
        <div className="flex flex-1 flex-row h-full overflow-hidden">
            {votingColumn}
            {closedProposalsColumn}
        </div>
    );

    const openVotingSessionsWarning = (
        <Alert status="warning" className="mb-4">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Avoimia äänestyksiä {openVotingSessions.length}</Alert.Title>
                <Alert.Description>
                    Kokouksessa on jo avoimia äänestyksiä. Varmista, että uusi äänestys ei aiheuta sekaannusta.
                </Alert.Description>
            </Alert.Content>
        </Alert >
    );

    const footer = (
        <div className="px-4 py-4 border-t border-border bg-background shrink-0">
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
                        required
                        value={speechDescriptionInput}
                        onChange={(e) => setSpeechDescriptionInput(e.target.value)}
                    />
                    <Select
                        className="flex-basis-48"
                        value={speechTypeInput}
                        onChange={(value) => setSpeechTypeInput(value as string)}
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {speechTypes && speechTypes.map((type) => {
                                    return (
                                        <ListBox.Item key={type.id} id={type.id}>
                                            <div className="flex flex-row justify-start items-center">
                                                <div className="flex h-8 items-center pt-px">
                                                    <Image src={SPEECH_TYPE_ICON[type.id]} alt={type.label} width={18} height={18} />
                                                </div>
                                                <div className="ml-2 text-sm text-muted">{type.label}</div>
                                            </div>
                                        </ListBox.Item>
                                    )
                                })}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                    <Button type="submit" className="flex-shrink-0 whitespace-nowrap">
                        Lisää puheenvuoro
                    </Button>
                </Form>
            </div>
        </div>);

    const content = selectedTab === "SPEECHES" ? speechesTab : votingTab;

    // first require user to give their name before showing the meeting page
    return (
        userName === "" ? loginScreen
            : (
                <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
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
                                    variant={selectedTab === "SPEECHES" ? "tertiary" : "outline"}
                                    onPress={() => setSelectedTab("SPEECHES")}
                                >
                                    Puheenvuorot
                                </Button>
                                <Button
                                    variant={selectedTab === "VOTING" ? "tertiary" : "outline"}
                                    onPress={() => setSelectedTab("VOTING")}
                                >
                                    Äänestys
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Main: fills remaining height, does NOT scroll */}
                    <div className="flex-1 min-h-0 overflow-hidden">

                        {content}
                    </div>
                    {/* Footer: in flow, pinned with sticky */}
                    {footer}
                    <Modal>
                        <Modal.Backdrop isOpen={isProposalFormOpen} onOpenChange={setIsProposalFormOpen}>
                            <Modal.Container>
                                <Modal.Dialog>
                                    <Modal.Header className="flex flex-col gap-1">Uusi ehdotus</Modal.Header>
                                    <Modal.Body>
                                        <Surface className="p-3 mt-3">
                                            <Form
                                                id="proposalForm"
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    handleAddProposal();
                                                    setIsProposalFormOpen(false);
                                                }}
                                            >
                                                <TextField>
                                                    <Label htmlFor="proposal-description-input">Ehdotuksen sisältö</Label>
                                                    <Input
                                                        id="proposal-description-input"
                                                        placeholder="Kuvaa ehdotuksesi tässä..."
                                                        value={proposalDescriptionInput}
                                                        onChange={(e) => setProposalDescriptionInput(e.target.value)}
                                                        required
                                                        autoFocus
                                                    />
                                                </TextField>
                                                {isMeetingAdmin && (
                                                    <>
                                                        <Checkbox
                                                            id="base-proposal-checkbox"
                                                            isSelected={isBaseProposal}
                                                            onChange={(selected) => setIsBaseProposal(selected)}
                                                            className="relative mt-4"
                                                            variant="secondary"
                                                        >
                                                            <Checkbox.Control>
                                                                <Checkbox.Indicator />
                                                            </Checkbox.Control>
                                                            <Label htmlFor="base-proposal-checkbox">Pohjaesitys</Label>

                                                        </Checkbox>
                                                    </>
                                                )}
                                            </Form>
                                        </Surface>
                                    </Modal.Body>
                                    <Modal.Footer>
                                        <Button variant="danger" onPress={() => setIsProposalFormOpen(false)}>
                                            Sulje
                                        </Button>

                                        <Button variant="primary" type="submit" form="proposalForm">
                                            Lisää
                                        </Button>
                                    </Modal.Footer>
                                </Modal.Dialog>
                            </Modal.Container>
                        </Modal.Backdrop>
                    </Modal>
                    <Modal>
                        <Modal.Backdrop isOpen={isVotingSessionModalOpen} onOpenChange={setIsVotingSessionModalOpen}>
                            <Modal.Container>
                                <Modal.Dialog>
                                    <Modal.Header className="flex flex-col gap-1">Avaa äänestys</Modal.Header>
                                    <Modal.Body>
                                        <Surface className="p-3">
                                            <p>
                                                Olet avaamassa äänestyksen valituista ehdotuksista ({selectedProposalIds.size} kpl).
                                            </p>
                                            <p>
                                                Äänestyksen avaamisen jälkeen ehdotuksia ei voi muokata.
                                                Ehdotuksista äänestetään vastakkain.
                                            </p>
                                            <p className="text-sm opacity-70">
                                                Äänestys avautuu heti kaikille kokouksen osallistujille.
                                            </p>
                                            <div className="flex items-center gap-3 mt-4 mb-2">
                                                <Checkbox
                                                    id="add-blank-option-checkbox"
                                                    isSelected={addBlankOption}
                                                    onChange={(selected) => setAddBlankOption(selected)}
                                                >
                                                    <Checkbox.Control>
                                                        <Checkbox.Indicator />
                                                    </Checkbox.Control>
                                                </Checkbox>
                                                <Label htmlFor="add-blank-option-checkbox">Lisää tyhjä vaihtoehto</Label>
                                            </div>
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
                                                {addBlankOption && (
                                                    <div className="px-2 py-1 border border-border rounded mb-1">
                                                        Tyhjä
                                                    </div>
                                                )}
                                            </div>
                                            <RadioGroup variant="secondary" value={createVotingSessionPublicity} onChange={(value) => setCreateVotingSessionPublicity(value as 'PUBLIC' | 'PRIVATE')} className="mt-4">
                                                <Label />
                                                <Description />
                                                <Radio value={"PUBLIC"}>
                                                    <Radio.Control>
                                                        <Radio.Indicator />
                                                    </Radio.Control>
                                                    <Radio.Content>
                                                        <Label >Avoin äänestys</Label>
                                                        <Description />
                                                    </Radio.Content>
                                                </Radio>
                                                <Radio value={"PRIVATE"}>
                                                    <Radio.Control>
                                                        <Radio.Indicator />
                                                    </Radio.Control>
                                                    <Radio.Content>
                                                        <Label >Suljettu äänestys</Label>
                                                        <Description />
                                                    </Radio.Content>
                                                </Radio>
                                                <FieldError />
                                            </RadioGroup>

                                            {openVotingSessions.length > 0 && (
                                                openVotingSessionsWarning
                                            )}
                                        </Surface>
                                    </Modal.Body>
                                    <Modal.Footer>
                                        <Button variant="outline" onPress={() => setIsVotingSessionModalOpen(false)}>
                                            Peruuta
                                        </Button>
                                        <Button
                                            variant="primary"
                                            onPress={async () => {
                                                await handleCreateVotingSession();
                                                setIsVotingSessionModalOpen(false);
                                            }}
                                        >
                                            Avaa äänestys
                                        </Button>
                                    </Modal.Footer>
                                </Modal.Dialog>
                            </Modal.Container>
                        </Modal.Backdrop>
                    </Modal>
                    <Modal>
                        <Modal.Backdrop isOpen={isQuickVoteOpen} onOpenChange={setIsQuickVoteOpen}>
                            <Modal.Container>
                                <Modal.Dialog>
                                    <Modal.Header className="flex flex-col gap-1">Uusi kyllä/ei -pikaäänestys</Modal.Header>
                                    <Modal.Body>
                                        <p className="text-sm opacity-80">
                                            Luodaan uusi ehdotus ja avataan siitä heti kyllä/ei-äänestys.
                                        </p>
                                        <Surface className="p-3 mt-3">
                                            <Form
                                                id="quickYesNoVoteForm"
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    handleCreateQuickYesNoVote();
                                                    setIsQuickVoteOpen(false);

                                                }}
                                            >
                                                <TextField>
                                                    <Label htmlFor="quick-vote-textarea">Ehdotuksen sisältö</Label>
                                                    <Input
                                                        id="quick-vote-textarea"
                                                        placeholder="Kirjoita kysymys tai ehdotus..."
                                                        value={quickVoteText}
                                                        onChange={(e) => setQuickVoteText(e.target.value)}
                                                        required
                                                        autoFocus
                                                        disabled={quickVoteSaving}
                                                    />
                                                </TextField>
                                            </Form>
                                            {openVotingSessions.length > 0 && (
                                                openVotingSessionsWarning
                                            )}
                                            {quickVoteError && (
                                                <div className="text-sm text-danger">
                                                    {quickVoteError}
                                                </div>
                                            )}
                                        </Surface>
                                    </Modal.Body>
                                    <Modal.Footer>
                                        <Button variant="outline" onPress={() => setIsQuickVoteOpen(false)} isDisabled={quickVoteSaving}>
                                            Peruuta
                                        </Button>
                                        <Button
                                            variant="primary"
                                            type="submit"
                                            form="quickYesNoVoteForm"
                                            isDisabled={quickVoteSaving || !quickVoteText.trim()}
                                        >
                                            Avaa äänestys
                                        </Button>
                                    </Modal.Footer>
                                </Modal.Dialog>
                            </Modal.Container>
                        </Modal.Backdrop>
                    </Modal>
                </div >
            )
    );
}
