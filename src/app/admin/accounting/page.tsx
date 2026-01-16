"use client";
import { useUser } from "@/context/UserContext";
import { Button, HeroUIProvider, Input } from "@heroui/react";
import { db, functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { AccountingData, FormAccounts } from "@/types";

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

const AccountingCodeInput: React.FC<{ value: string, onChange: (value: string) => void, accountingData: AccountingData }> = ({ value, onChange, accountingData }) => {
    const [accountName, setAccountName] = useState<string>("");
    const [invalid, setInvalid] = useState(false);
    useEffect(() => {
        if (!value) {
            setAccountName("");
            return;
        }
        // find the account name from the accountingData
        const account = accountingData.accounts.ledgerAccounts.find(account => account.ledgerAccountCode === value);
        if (account) {
            setAccountName(account.name);
            setInvalid(false);
        }
        else {
            setAccountName("TILIÄ EI LÖYDY");
            setInvalid(true);
        }
    }, [value]);
    return <div className="flex flex-col lg:flex-row gap-2">
        <Input
            value={value}
            onValueChange={onChange}
            className="w-full lg:w-1/4 font-mono"
            errorMessage={invalid ? "Tiliä ei löytynyt" : ""}
        />
        <Input
            value={accountName}
            isDisabled={true}
            className="w-full lg:w-3/4"
        />
    </div>
}

const AccountingPage: React.FC = () => {

    const user = useUser();
    const [updating, setUpdating] = useState(false);
    const [formAccounts, setFormAccounts] = useState<FormAccounts | null>(null);
    const [accountingData, setAccountingData] = useState<AccountingData | null>(null);

    const updateAccounting = async () => {
        setUpdating(true);
        const updateAccounting = httpsCallable(functions, 'updateAccounting');
        await updateAccounting();
        await getAccounts();
        setUpdating(false);
    }

    const getAccounts = async () => {
        console.log("getting accounts");
        console.log(user);
        const q_accounting = doc(db, "settings", "accounting");
        const accountingData = (await getDoc(q_accounting)).data() as AccountingData;
        setAccountingData(accountingData);

        const q_formAccounts = doc(db, "settings", "formAccounts");
        const formAccounts = (await getDoc(q_formAccounts)).data() as FormAccounts;
        setFormAccounts(formAccounts);
    };

    const setAccounts = async () => {
        console.log("setting accounts");
        console.log(formAccounts);
        if (!formAccounts) {
            console.log("no formAccounts");
            return;
        }
        // set the formAccounts to the firestore
        const q_formAccounts = doc(db, "settings", "formAccounts");
        await setDoc(q_formAccounts, formAccounts);
    }


    useEffect(() => {
        if (user) {
            getAccounts();
        }
    }, [user]);

    return (
        <HeroUIProvider>
            <div className="m-8 flex flex-col gap-4">
                <Button
                    onPress={updateAccounting}
                    isDisabled={!user}
                    isLoading={updating}
                >
                    Päivitä kirjanpitotilit Procountorista
                </Button>
                <p className="text-xl">Lomakkeen kirjanpitotilit</p>
                <p>Jos poistat jotain vahingossa, päivitä sivu</p>
                {formAccounts && formAccounts.sections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className="flex flex-col gap-2">
                        <div className="flex flex-row gap-2 justify-between">
                            <div className="flex flex-row gap-2">
                                <Input
                                    value={section.name}
                                    onValueChange={(value) => {
                                        formAccounts.sections[sectionIndex].name = value;
                                        setFormAccounts({ ...formAccounts });
                                    }}
                                    className="w-4/6"
                                />
                                <Button
                                    onPress={() => {
                                        // move the section up in the list
                                        const section = formAccounts.sections[sectionIndex];
                                        formAccounts.sections.splice(sectionIndex, 1);
                                        formAccounts.sections.splice(sectionIndex - 1, 0, section);
                                        setFormAccounts({ ...formAccounts });
                                    }}
                                    isDisabled={sectionIndex === 0}
                                >
                                    <UpIcon />
                                </Button>
                                <Button
                                    onPress={() => {
                                        // move the section up in the list
                                        const section = formAccounts.sections[sectionIndex];
                                        formAccounts.sections.splice(sectionIndex, 1);
                                        formAccounts.sections.splice(sectionIndex + 1, 0, section);
                                        setFormAccounts({ ...formAccounts });
                                    }}
                                    isDisabled={sectionIndex === formAccounts.sections.length - 1}
                                >
                                    <DownIcon />
                                </Button>
                            </div>
                            <Button
                                color={"danger"}
                                className="w-1/5"
                                onPress={() => {
                                    formAccounts.sections.splice(sectionIndex, 1);
                                    setFormAccounts({ ...formAccounts });
                                }}>
                                Poista tiliryhmä {section.name}
                            </Button>
                        </div>
                        <div className="flex flex-col gap-2 ml-8">
                            {section.accounts.map((account, accountIndex) => (
                                <div key={accountIndex} className="flex flex-row gap-2 justify-between">
                                    <div className="flex flex-row gap-2 w-full">
                                        <Input
                                            className="w-1/4"
                                            value={account.name}
                                            onValueChange={(value) => {
                                                formAccounts.sections[sectionIndex].accounts[accountIndex].name = value;
                                                setFormAccounts({ ...formAccounts });
                                            }}
                                            validate={(value) => {
                                                if (!value) {
                                                    return "Tilin nimi on pakollinen";
                                                }
                                                if (value.length > 50) {
                                                    return "Tilin nimi on liian pitkä";
                                                }
                                                if (section.name === "Kerhot") {
                                                    // the Kerhot section requires a item id from the dimensions
                                                    const dimension = accountingData?.dimensions.find(dimension => dimension.name === "Kerhot");
                                                    const item = dimension?.items.find(item => item.codeName === value);
                                                    if (!item) {
                                                        return "Kerhoa ei löytynyt Procountorin Kerhot-dimensiosta, tarkasta kirjoitusasu";
                                                    }
                                                }
                                            }
                                            }
                                        />
                                        {section.name !== "Kerhot" &&
                                            <AccountingCodeInput
                                                value={account.accountCode || ""}
                                                onChange={(value) => {
                                                    formAccounts.sections[sectionIndex].accounts[accountIndex].accountCode = value;
                                                    setFormAccounts({ ...formAccounts });
                                                }}
                                                accountingData={accountingData!}
                                            />
                                        }
                                        <Button
                                            isDisabled={accountIndex === 0}
                                            onPress={() => {
                                                // move the account up in the list
                                                const account = formAccounts.sections[sectionIndex].accounts[accountIndex];
                                                formAccounts.sections[sectionIndex].accounts.splice(accountIndex, 1);
                                                formAccounts.sections[sectionIndex].accounts.splice(accountIndex - 1, 0, account);
                                                setFormAccounts({ ...formAccounts });
                                            }}
                                        >
                                            <UpIcon />
                                        </Button>
                                        <Button
                                            isDisabled={accountIndex === formAccounts.sections[sectionIndex].accounts.length - 1}
                                            onPress={() => {
                                                // move the account down in the list
                                                const account = formAccounts.sections[sectionIndex].accounts[accountIndex];
                                                formAccounts.sections[sectionIndex].accounts.splice(accountIndex, 1);
                                                formAccounts.sections[sectionIndex].accounts.splice(accountIndex + 1, 0, account);
                                                setFormAccounts({ ...formAccounts });
                                            }}
                                        >
                                            <DownIcon />
                                        </Button>
                                    </div>
                                    <Button
                                        color={"danger"}
                                        onPress={() => {
                                            formAccounts.sections[sectionIndex].accounts.splice(accountIndex, 1);
                                            setFormAccounts({ ...formAccounts });
                                        }}>
                                        Poista tili {account.name}
                                    </Button>
                                </div>
                            ))}

                            {section.name !== "Kerhot" && <Button
                                color={"primary"}
                                className="w-1/2"
                                onPress={() => {
                                    formAccounts.sections[sectionIndex].accounts.push({
                                        name: "",
                                        accountCode: ""
                                    });
                                    setFormAccounts({ ...formAccounts });
                                }}>
                                Uusi tili ryhmään {section.name}
                            </Button>
                            }
                            {section.name === "Kerhot" && (
                                <Button
                                    color={"primary"}
                                    className="w-1/2 text-wrap"
                                    onPress={() => {
                                        // find the Kerhot dimension
                                        // add all the items to the formAccounts, under the Kerhot section
                                        // remove the Yleinen item
                                        const dimension = accountingData?.dimensions.find(dimension => dimension.name === "Kerhot");
                                        if (!dimension) {
                                            return;
                                        }
                                        formAccounts.sections[sectionIndex].accounts = dimension.items.map(item => ({
                                            name: item.codeName,
                                            dimensionId: dimension.id,
                                            itemId: item.id,
                                            accountCode: ""
                                        }));
                                        setFormAccounts({ ...formAccounts });
                                    }}>
                                    Kerhot: hae Procountorin Kerhot-dimensiosta
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
                <Button
                    color={"primary"}
                    className="w-1/2"
                    onPress={() => {
                        if (!formAccounts) {
                            return;
                        }
                        formAccounts.sections.push({
                            name: "",
                            accounts: []
                        });
                        setFormAccounts({ ...formAccounts });
                    }
                    }>
                    Uusi tiliryhmä
                </Button>

                <p className="text-xl">Kerhon laskutuksen syyt</p>
                {formAccounts && formAccounts.kerhoReasons.map((kerhoReason, index) => (
                    <div key={index} className="flex flex-row gap-2">
                        <Input
                            value={kerhoReason.name}
                            className="w-1/3"
                            onValueChange={(value) => {
                                formAccounts.kerhoReasons[index].name = value;
                                setFormAccounts({ ...formAccounts });
                            }}
                        />
                        <AccountingCodeInput
                            value={kerhoReason.accountCode}
                            onChange={(value) => {
                                formAccounts.kerhoReasons[index].accountCode = value;
                                setFormAccounts({ ...formAccounts });
                            }}
                            accountingData={accountingData!}
                        />
                    </div>
                ))}
                <Button
                    color={"primary"}
                    className="w-1/3"
                    onPress={() => {
                        if (!formAccounts) {
                            return;
                        }
                        formAccounts.kerhoReasons.push({
                            name: "",
                            accountCode: ""
                        });
                        setFormAccounts({ ...formAccounts });
                    }}>
                    Uusi kerhon laskutuksen syy</Button>

                <p className="text-xl">Toimikunnat</p>
                {formAccounts && formAccounts.toimikunnat.map((toimikunta, index) => (
                    <div key={index} className="flex flex-row gap-2">
                        <Input
                            value={toimikunta.name}
                            className="w-1/3"
                            onValueChange={(value) => {
                                formAccounts.toimikunnat[index].name = value;
                                setFormAccounts({ ...formAccounts });
                            }}
                        />
                    </div>
                ))}
                <Button
                    color={"primary"}
                    className="w-1/2 text-wrap"
                    onPress={() => {
                        if (!formAccounts) {
                            return;
                        }
                        if (!accountingData) {
                            return;
                        }
                        const toimikunnatDimension = accountingData?.dimensions.find(dimension => dimension.name === "Valiokunnat");
                        if (!toimikunnatDimension) {
                            return;
                        }
                        formAccounts.toimikunnat = toimikunnatDimension.items.map(item => ({
                            name: item.codeName,
                            dimensionId: toimikunnatDimension.id,
                            itemId: item.id
                        })).filter(item => item.name !== "Yleinen");

                        setFormAccounts({ ...formAccounts });
                    }}
                >
                    Toimikunnat: hae Procountorin Toimikunnat-dimensiosta
                </Button>
                <p className="text-xl">Oletustiliöinti virhetilanteissa</p>

                <AccountingCodeInput
                    value={formAccounts?.defaultAccount || ""}
                    onChange={(value) => {
                        if (!formAccounts) {
                            return;
                        }
                        formAccounts.defaultAccount = value;
                        setFormAccounts({ ...formAccounts });
                    }}
                    accountingData={accountingData!}
                />
                <Button
                    color={"success"}
                    onPress={setAccounts}>
                    Tallenna
                </Button>
                <div>
                    <p className="text-xl">Kirjanpitotilit Procountorista</p>
                    {accountingData && accountingData.accounts.ledgerAccounts.map((account, index) => (
                        <div key={index} className="flex flex-col gap-2">
                            {account.active && <p><span className="font-mono">{account.ledgerAccountCode}</span> {account.name}</p>}
                        </div>
                    ))}
                </div>
            </div>
        </HeroUIProvider>
    );
};

export default AccountingPage;
