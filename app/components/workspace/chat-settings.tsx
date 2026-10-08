"use client";

import type { ChatProtocol, ChatProviderId } from "../../chat-contract";
import styles from "./chat.module.css";
import { ChatPicker, type ChatPickerOption } from "./chat-picker";
import { protocols, regions } from "./chat-data.mjs";
import { useT } from "../../i18n/provider";

export function ChatSettings({
  provider,
  model,
  region,
  protocol,
  needsProtocol,
  providerOptions,
  modelOptions,
  providersLoading,
  modelsLoading,
  modelsError,
  modelsCount,
  busy,
  onProviderChange,
  onRegionChange,
  onModelChange,
  onProtocolChange,
}: {
  provider: ChatProviderId | "";
  model: string;
  region: string;
  protocol: ChatProtocol | "";
  needsProtocol: boolean;
  providerOptions: ChatPickerOption[];
  modelOptions: ChatPickerOption[];
  providersLoading: boolean;
  modelsLoading: boolean;
  modelsError: string;
  modelsCount: number;
  busy: boolean;
  onProviderChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onProtocolChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <div className={styles.settingsTop}>
      <div className={styles.providerField}>
        <ChatPicker
          label={t("Proveedor")}
          value={provider}
          options={providerOptions}
          disabled={busy || providersLoading}
          loading={providersLoading}
          onChange={onProviderChange}
        />
      </div>
      {provider === "bedrock" && (
        <select
          aria-label={t("Región de Bedrock")}
          value={region}
          disabled={busy}
          onChange={(event) => onRegionChange(event.target.value)}
        >
          {regions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      )}
      <div className={styles.modelField}>
        <ChatPicker
          label={t("Modelo")}
          value={model}
          options={modelOptions}
          disabled={!provider || modelsLoading || busy || !!modelsError || modelsCount === 0}
          loading={modelsLoading}
          onChange={onModelChange}
        />
      </div>
      {needsProtocol && (
        <select
          aria-label={t("Formato API")}
          value={protocol}
          disabled={busy}
          onChange={(event) => onProtocolChange(event.target.value)}
        >
          <option value="">{t("Elige un formato")}</option>
          {protocols.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
