import { OBR, waitForObrReady } from "../bridge/obrBridge.js";

export const MOVE_TOOL_CHANNEL = "odyssey:tactical-move";

export const MOVE_TOOL_COMMANDS = Object.freeze({
  ActivateSelected: "ACTIVATE_SELECTED",
  Cancel: "CANCEL",
  RequestStatus: "REQUEST_STATUS",
});

export const MOVE_TOOL_EVENTS = Object.freeze({
  Status: "STATUS",
  Activated: "ACTIVATED",
  Cancelled: "CANCELLED",
  Applied: "APPLIED",
  Error: "ERROR",
});

export async function publishMoveToolEvent(type, payload = {}, destination = "LOCAL") {
  await waitForObrReady();
  await OBR.broadcast.sendMessage(
    MOVE_TOOL_CHANNEL,
    { type, payload },
    { destination },
  );
}

export async function sendMoveToolCommand(command, payload = {}, destination = "LOCAL") {
  await waitForObrReady();
  await OBR.broadcast.sendMessage(
    MOVE_TOOL_CHANNEL,
    { type: command, payload },
    { destination },
  );
}

export async function subscribeMoveToolMessages(listener) {
  await waitForObrReady();
  let active = true;
  const unsubscribe = OBR.broadcast.onMessage(MOVE_TOOL_CHANNEL, (event) => {
    if (!active) return;
    const data = event?.data ?? {};
    listener({
      type: String(data?.type ?? "").trim(),
      payload: data?.payload ?? {},
      connectionId: event?.connectionId ?? "",
    });
  });
  return () => {
    active = false;
    unsubscribe?.();
  };
}
