import { Proposal, VotingSession } from "./types";

export const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString("fi-FI");
    } else {
        return date.toLocaleDateString("fi-FI");
    }
}

export const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
}

export const SPEECH_TYPE_ICON: Record<string, string> = {
    DEFAULT: "/icons/default.svg",
    COMMENT: "/icons/comment.svg",
    SUPPORT: "/icons/support.svg",
    TECHNICAL: "/icons/technical.svg",
    PROPOSAL: "/icons/proposal.svg",
};

export const ACTION_ICON: Record<string, string> = {
    NEXT: "/icons/next.svg",
    SKIP: "/icons/skip.svg",
    PLAY_PAUSE: "/icons/play-pause.svg",
    STOP: "/icons/stop.svg",
    PROPOSAL: "/icons/proposal.svg",
    SUPPORT: "/icons/support.svg",
    EDIT: "/icons/edit.svg",
    BASE_PROPOSAL: "/icons/base-proposal.svg",
};


export const checkIfProposalsCanBeClosedFromVotingResults = (session: VotingSession, openProposals: Proposal[]) => {
    if (session.type === "FOR-AGAINST-ABSTAIN") {
        if (session.proposalIds.length !== 1) {
            return false;
        }
        const proposalId = session.proposalIds[0];
        if (openProposals.some(p => p.id === proposalId)) {
            const votesFor = session.votes.filter(v => {
                const option = session.voteOptions.find(o => o.id === v.voteOptionId);
                return option?.type === "FOR-AGAINST-ABSTAIN" && option.vote === "FOR";
            }).length;
            const votesAgainst = session.votes.filter(v => {
                const option = session.voteOptions.find(o => o.id === v.voteOptionId);
                return option?.type === "FOR-AGAINST-ABSTAIN" && option.vote === "AGAINST";
            }).length;
            return votesFor !== votesAgainst;
        }
        else {
            return false;
        }
    }
    else {
        const proposalIdsInSession = session.voteOptions.filter(o => o.type === "PROPOSAL").map(o => o.proposalId);
        if (proposalIdsInSession.every(pid => openProposals.some(p => p.id === pid))) {
            // check if there's a winner
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

            let maxVotes = -1;
            let winningProposalId: string | null = null;
            for (const proposalId in proposalVotesCount) {
                if (proposalVotesCount[proposalId] > maxVotes) {
                    maxVotes = proposalVotesCount[proposalId];
                    winningProposalId = proposalId;
                }
            }

            const tiedProposalIds = Object.keys(proposalVotesCount).filter(pid => proposalVotesCount[pid] === maxVotes);
            if (tiedProposalIds.length > 1) {
                console.log("Voting session resulted in a tie between proposals:", tiedProposalIds);
                return false;
            }

            return true;
        }
        else {
            return false;
        }
    }

}

