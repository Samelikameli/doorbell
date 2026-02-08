import { Speech, SpeechType } from "@/types";
import { Button } from "@heroui/react";
import { formatDate, formatDuration } from "@/utils";


export function CompletedSpeech({ speech, speechType, isMeetingAdmin, userName }: { speech: Speech, speechType: SpeechType, isMeetingAdmin: boolean, userName: string }) {
    const duration = speech.startedAt && speech.completedAt
        ? Math.round((speech.completedAt.getTime() - speech.startedAt.getTime()) / 1000)
        : null;

    return (
        <div className="flex flex-row border border-border rounded p-2 mb-2">
            <div className="flex flex-col">
                <p>{speech.ordinal}. <strong>{speech.speakerName}</strong> - {speechType.label}</p>
                <p>{speech.description} <span className="text-sm text-muted">{speech.skipped ? "Ohitettu" : <span>Alkoi: {formatDate(speech.startedAt!)}, kesto: {formatDuration(duration!)}</span>}</span></p>
            </div>
        </div>
    );
}
