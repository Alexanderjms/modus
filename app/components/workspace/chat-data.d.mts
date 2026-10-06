import type { ChatProtocol, ChatProviderId } from "../../chat-contract";

export const providers: {
  id: ChatProviderId;
  name: string;
  logo: string;
  invertInDark?: boolean;
}[];
export const regions: string[];
export const protocols: { id: ChatProtocol; name: string }[];
export const maxMessages: number;
export const maxTotalCharacters: number;
