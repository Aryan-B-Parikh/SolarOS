import { redirect } from 'next/navigation';

export default function PortalEquipmentPage({ params }: { params: { token: string } }) {
  redirect(`/portal/${params.token}#equipment`);
}

