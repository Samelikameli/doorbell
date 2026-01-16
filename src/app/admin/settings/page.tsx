"use client";
import { useUser } from "@/context/UserContext";
import { Button, HeroUIProvider, Input } from "@heroui/react";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Announcement, OrganizationData } from "@/types";
import { db } from "@/firebase";
import { Select, SelectItem } from "@heroui/select";


const UpIcon = () => {
    return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75 12 3m0 0 3.75 3.75M12 3v18" />
    </svg>
}
const DownIcon = () => {
    return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
    </svg>
}

const announcementTypes = ['default', 'warning', 'danger'];


const AnnouncementsPage: React.FC = () => {
    const user = useUser();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [signatureName, setSignatureName] = useState<string>("");
    const [organizationData, setOrganizationData] = useState<OrganizationData>({ name: "", address: "", postCode: "", city: "", yTunnus: "" });

    useEffect(() => {
        if (user) {
            getAnnouncements();
            getSignatureName();
            getOrganizationData();
        }
    }, [user]);

    const getAnnouncements = async () => {
        const docRef = doc(db, "settings", "announcements");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            setAnnouncements(docSnap.data().announcements as Announcement[]);
        }
    }

    const getSignatureName = async () => {
        const docRef = doc(db, "settings", "signatureName");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            setSignatureName(docSnap.data().signatureName as string);
        }
    }

    const getOrganizationData = async () => {
        const docRef = doc(db, "settings", "organizationData");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            setOrganizationData(docSnap.data().data as OrganizationData);
        }
    }

    const saveSignatureName = async () => {
        const docRef = doc(db, "settings", "signatureName");
        await setDoc(docRef, { signatureName });
    }

    const saveAnnouncements = async () => {
        const docRef = doc(db, "settings", "announcements");
        await setDoc(docRef, { announcements });
    }
    const saveOrganizationData = async () => {
        const docRef = doc(db, "settings", "organizationData");
        await setDoc(docRef, { data: organizationData });
    }

    return (
        <HeroUIProvider>
            <h1 className="m-8 text-xl">Asetukset</h1>
            <h2 className="m-8 text-l">Ilmoitukset</h2>
            <div className="m-8 flex flex-col gap-8">
                {announcements.map((announcement, index) => <div key={index} className="flex flex-col gap-2">
                    <Input
                        value={announcement.content}
                        onValueChange={(value) => {
                            const newAnnouncements = [...announcements];
                            newAnnouncements[index].content = value;
                            setAnnouncements(newAnnouncements);
                        }}
                    />
                    <div className="flex flex-row gap-4">
                        <Select
                            className="w-3/6"
                            selectedKeys={new Set([announcement.type])}
                            aria-label="Tärkeys"
                            onSelectionChange={(value) => {
                                const newAnnouncements = [...announcements];
                                const selectedKey = Array.from(value)[0];
                                newAnnouncements[index].type = selectedKey as Announcement['type'];
                                setAnnouncements(newAnnouncements);
                            }}
                        >
                            {announcementTypes.map((t) =>
                                <SelectItem key={t}>{t}</SelectItem>
                            )}
                        </Select>
                        <Button
                            className="w-1/6"

                            onPress={() => {
                                // move the section up in the list
                                const a = announcements[index];
                                announcements.splice(index, 1);
                                announcements.splice(index - 1, 0, a);
                                setAnnouncements([...announcements]);
                            }}
                            isDisabled={index === 0}
                        >
                            <UpIcon />
                        </Button>
                        <Button
                            className="w-1/6"

                            onPress={() => {
                                // move the section up in the list
                                const a = announcements[index];
                                announcements.splice(index, 1);
                                announcements.splice(index + 1, 0, a);
                                setAnnouncements([...announcements]);
                            }}
                            isDisabled={index === announcements.length - 1}
                        >
                            <DownIcon />
                        </Button>
                        <Button
                            className="w-1/6"

                            onPress={() => {

                                const newAnnouncements = [...announcements];
                                newAnnouncements.splice(index, 1);
                                setAnnouncements(newAnnouncements);
                            }} color="danger">Poista ilmoitus</Button>
                    </div>
                </div>
                )}
                <div className="flex">
                    <Button onPress={saveAnnouncements} color="primary">Tallenna ilmoitukset</Button>
                </div>

            </div>
            <h2 className="m-8 text-l">Allekirjoitus</h2>
            <Input
                className="m-8 w-1/2"
                value={signatureName}
                onValueChange={(value) => setSignatureName(value)}
            />
            <Button className="m-8" onPress={saveSignatureName} color="primary">Tallenna allekirjoitus</Button>
            <h2 className="m-8 text-l">Organisaation tiedot</h2>
            <div className="m-8 flex flex-col gap-4 w-1/2">
                <Input
                    label="Nimi"
                    value={organizationData.name}
                    onValueChange={(value) => setOrganizationData({ ...organizationData, name: value })}
                />
                <Input
                    label="Osoite"
                    value={organizationData.address}
                    onValueChange={(value) => setOrganizationData({ ...organizationData, address: value })}
                />
                <Input
                    label="Postinumero"
                    value={organizationData.postCode}
                    onValueChange={(value) => setOrganizationData({ ...organizationData, postCode: value })}
                />
                <Input
                    label="Kaupunki"
                    value={organizationData.city}
                    onValueChange={(value) => setOrganizationData({ ...organizationData, city: value })}
                />
                <Input
                    label="Y-tunnus"
                    value={organizationData.yTunnus}
                    onValueChange={(value) => setOrganizationData({ ...organizationData, yTunnus: value })}
                />
                <Button onPress={saveOrganizationData} color="primary">Tallenna organisaation tiedot</Button>
            </div>
        </HeroUIProvider>
    );
};

export default AnnouncementsPage;
