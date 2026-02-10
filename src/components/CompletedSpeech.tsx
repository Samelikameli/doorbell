import Image from "next/image";
import { Speech, SpeechType } from "@/types";
import { formatDate, formatDuration, SPEECH_TYPE_ICON } from "@/utils";


export function CompletedSpeech({
    speech,
    speechType,
}: {
    speech: Speech;
    speechType: SpeechType;
}) {
    const duration =
        speech.startedAt && speech.completedAt
            ? Math.round(
                (speech.completedAt.getTime() - speech.startedAt.getTime()) / 1000
            )
            : null;

    const iconSrc =
        SPEECH_TYPE_ICON[speechType.id] ?? SPEECH_TYPE_ICON.DEFAULT;

    return (
        <div className="flex flex-row border border-border rounded p-2 mb-2 gap-3">
            <div className="flex-shrink-0 mt-0.5">
                <Image
                    src={iconSrc}
                    alt={speechType.label}
                    width={36}
                    height={36}
                />
            </div>

            <div className="flex flex-col">
                <p>
                    {speech.ordinal}. <strong>{speech.speakerName}</strong> –{" "}
                    {speechType.label}
                </p>
                <p>
                    {speech.description}{" "}
                    <span className="text-sm text-muted">
                        {speech.skipped
                            ? "Ohitettu"
                            : `Alkoi: ${formatDate(
                                speech.startedAt!
                            )}, kesto: ${formatDuration(duration!)}`}
                    </span>
                </p>
            </div>
        </div>
    );
}
