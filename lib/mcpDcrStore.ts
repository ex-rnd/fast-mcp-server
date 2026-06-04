type DcrRecord = {
  clientId: string;
  ownerSub: string;
  grantedScopes: string[];
  accessKey: string;
  registeredAt: string;
};

const records = new Map<string, DcrRecord>();

function makeKey(ownerSub: string, clientId: string): string {
  return `${ownerSub}:${clientId}`;
}

export function putDcrRecord(record: DcrRecord): void {
  records.set(makeKey(record.ownerSub, record.clientId), record);
}

export function getDcrRecord(ownerSub: string, clientId: string): DcrRecord | undefined {
  return records.get(makeKey(ownerSub, clientId));
}
