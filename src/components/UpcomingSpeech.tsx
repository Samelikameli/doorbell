import { Speech, SpeechType } from "@/types";
import { Button, Tooltip } from "@heroui/react";
import { SpeechAction } from "@/types";
import { formatDate } from "@/utils";
import Image from "next/image";
import { SPEECH_TYPE_ICON, ACTION_ICON } from "@/utils";

export function UpcomingSpeech({
    speech,
    speechType,
    isMeetingAdmin,
    actions,
    userName,
    next,
    skipAction,
}: {
    speech: Speech;
    speechType: SpeechType;
    isMeetingAdmin: boolean;
    actions: SpeechAction[];
    userName: string;
    next: boolean;
    skipAction: () => void;
}) {
    const s = formatDate(speech.createdAt);
    const iconSrc = SPEECH_TYPE_ICON[speechType.id] ?? SPEECH_TYPE_ICON.DEFAULT;

    return (
        <div className="flex flex-row items-start gap-3 border border-border rounded p-2 mb-2">
            {/* ICON */}
            <div className="flex-shrink-0 mt-1">
                <Image
                    src={iconSrc}
                    alt={speechType.label}
                    width={36}
                    height={36}
                />

            </div>

            {/* CONTENT */}
            <div className="flex flex-col flex-1">
                <p>
                    {speech.ordinal}. <strong>{speech.speakerName}</strong> – {speechType.label}
                </p>
                <p>{speech.description}</p>
                <p className="text-sm text-muted">Aika: {s}</p>
            </div>

            {/* ADMIN ACTIONS */}
            {isMeetingAdmin && (
                <div className="flex flex-col ml-auto space-y-2">
                    {actions.map((action, index) => (
                        <Tooltip key={index} content={action.label} placement="left">
                            <Button key={index} isIconOnly className="text-left" onPress={action.onPress}>
                                <Image src={ACTION_ICON[action.icon]} alt={action.label} width={24} height={24} />
                            </Button>
                        </Tooltip>
                    ))}
                </div>
            )}

            {/* SELF SKIP */}
            {speech.speakerName === userName && !isMeetingAdmin && skipAction && (
                <div className="flex flex-col ml-auto">
                    <Button onPress={skipAction} isIconOnly >
                        <Image src={ACTION_ICON["SKIP"]} alt="Skip" width={24} height={24} />
                    </Button>
                </div>
            )}
        </div>
    );
}
