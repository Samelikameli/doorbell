import { doc, Firestore, getDoc } from "firebase/firestore";
import { FirestoreInvoiceData, FirestoreRow, FormFile, FormRow, OrganizationData } from "./types";

export const getFormattedSum = (sum: number) => {
    return (Math.round(sum) / 100).toFixed(2).replace('.', ',');
};

export const stringToCents = (value: string) => {
    return Math.floor(parseFloat(value.replaceAll(",", ".")) * 100);
};

export const wrapText = (text: string, maxChars: number): string => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        if ((currentLine + word).length > maxChars) {
            lines.push(currentLine.trim());
            currentLine = word + " ";
        } else {
            currentLine += word + " ";
        }
    }

    if (currentLine.trim().length > 0) {
        lines.push(currentLine.trim());
    }

    return lines.join("\n");
}


export const getFormattedIBAN = (iban: string) => {
    const cleanedIBAN = iban.replace(/\s+/g, '').toUpperCase();
    const formattedIBAN = cleanedIBAN.match(/.{1,4}/g)?.join(' ') || '';

    return formattedIBAN;
};

export const isKerhoAccount = (account: string | null) => {
    return account?.startsWith("Kerhot:") || false;
}

export const isToimikuntaAccount = (account: string | null) => {
    return account?.startsWith("Hallinto: Toimikuntien") || false;
}

export const getFormattedAccount = (data: FormRow | FirestoreInvoiceData | FirestoreRow) => {
    return data.account + " " + (data.kerhoReason ? data.kerhoReason : "") + " " + ((data.toimikunta ? data.toimikunta : "") + (data.participants ? (", osallistujamäärä: " + data.participants) : ""));
}

export const getFormattedPhone = (phone: string) => {
    const cleanedPhone = phone.replace(/[^\d+]/g, '');

    if (cleanedPhone === "" || cleanedPhone === "+") {
        return "";
    }

    let normalizedPhone = cleanedPhone;
    if (cleanedPhone.startsWith('0')) {
        normalizedPhone = `+358${cleanedPhone.slice(1)}`;
    } else if (!cleanedPhone.startsWith('+358')) {
        normalizedPhone = `+358${cleanedPhone}`;
    }

    const formattedPhone = normalizedPhone.replace(
        /^\+358(\d{2})(\d{3})(\d{4})$/,
        (_, part1, part2, part3) => `+358 ${part1} ${part2} ${part3}`
    );

    return formattedPhone;
};

export const getFormattedDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}.${month}.${year}`;
}

export const getFormattedDateTime = (date: Date) => {
    const pad = (num: number) => num.toString().padStart(2, "0");
    return date.getDate() + "." + (date.getMonth() + 1) + "." + date.getFullYear() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
};


/*
 * Returns 1 if the IBAN is valid 
 * Returns FALSE if the IBAN's length is not as should be (for CY the IBAN Should be 28 chars long starting with CY )
 * Returns any other number (checksum) when the IBAN is invalid (check digits do not match)
 */
export const isValidIBANNumber = (input: string) => {
    const CODE_LENGTHS = {
        AD: 24, AE: 23, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
        CH: 21, CR: 21, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, ES: 24,
        FI: 18, FO: 18, FR: 27, GB: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21,
        HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28,
        LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27,
        MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
        RO: 24, RS: 22, SA: 24, SE: 24, SI: 19, SK: 24, SM: 27, TN: 24, TR: 26,
        AL: 28, BY: 28, EG: 29, GE: 22, IQ: 23, LC: 32, SC: 31, ST: 25,
        SV: 28, TL: 23, UA: 29, VA: 22, VG: 24, XK: 20
    };
    const iban = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '') // keep only alphanumeric characters
    const code = iban.match(/^([A-Z]{2})(\d{2})([A-Z\d]+)$/) // match and capture (1) the country code, (2) the check digits, and (3) the rest

    // check syntax and length
    if (!code || iban.length !== CODE_LENGTHS[code[1] as keyof typeof CODE_LENGTHS]) {
        return false;
    }
    // rearrange country code and check digits, and convert chars to ints
    const digits = (code[3] + code[1] + code[2]).replace(/[A-Z]/g, (letter: string) => {
        return (letter.charCodeAt(0) - 55).toString();
    });
    // final check
    return mod97(digits) === 1;
}

function mod97(str: string) {
    let checksum = parseInt(str.slice(0, 2));
    let fragment;
    for (let offset = 2; offset < str.length; offset += 7) {
        fragment = String(checksum) + str.substring(offset, offset + 7);
        checksum = parseInt(fragment, 10) % 97;
    }
    return checksum;
}

export const getOrganizationData = async (db: Firestore) => {
    const docRef = doc(db, "settings", "organizationData");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data().data as OrganizationData;
    }
    return { name: "", address: "", postCode: "", city: "", yTunnus: "" } as OrganizationData;
}
export const getSafeExt = (file?: FormFile | null) => {
    if (file?.magic && file.magic !== "other") return file.magic;

    const name = file?.file?.name ?? "";
    const fromName = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";

    return fromName || "bin";
};
