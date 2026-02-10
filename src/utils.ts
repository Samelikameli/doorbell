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
