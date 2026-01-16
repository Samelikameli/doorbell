"use client";
import { InvoiceTable } from "@/components/InvoiceTable";
import { HeroUIProvider } from "@heroui/react";

const DashboardPage: React.FC = () => {

    return (
        <HeroUIProvider>
            <div className={`m-8`}>
                <InvoiceTable />
            </div>
        </HeroUIProvider>
    );
};

export default DashboardPage;
