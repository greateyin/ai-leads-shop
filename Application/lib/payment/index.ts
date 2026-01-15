import { db } from "@/lib/db";
import { PaymentProviderType } from "@prisma/client";

export async function getProviderConfig(
    tenantId: string,
    providerType: PaymentProviderType
): Promise<Record<string, any> | null> {
    const provider = await db.paymentProvider.findFirst({
        where: {
            tenantId,
            type: providerType,
        },
        select: { config: true },
    });

    if (!provider?.config) {
        return null;
    }

    return provider.config as Record<string, any>;
}
