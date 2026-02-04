import { CallbackClient } from "./_components/CallbackClient";

type CallbackPageProps = {
    searchParams?: {
        token?: string;
    };
};

export default function CallbackPage({ searchParams }: CallbackPageProps) {
    return <CallbackClient token={searchParams?.token} />;
}
