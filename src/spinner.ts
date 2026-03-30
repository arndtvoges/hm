import { CLEAR_LINE, DIM, ORANGE, RESET } from "./color";

const brailleFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const circleFrames = ["○", "◔", "◑", "◕", "●"];
const cornerFrames = ["▖", "▘", "▝", "▗"];

function createSpinner(frames: string[], interval: number, label?: string) {
  let i = 0;
  const suffix = label ? ` ${label}` : "";
  const id = setInterval(() => {
    const frame = frames[i++ % frames.length];
    process.stdout.write(`\r${ORANGE}${frame}${DIM}${suffix}${RESET}`);
  }, interval);

  return {
    stop() {
      clearInterval(id);
      process.stdout.write(`\r${CLEAR_LINE}`);
    },
  };
}

export function spinner() {
  return createSpinner(brailleFrames, 80);
}

export function doctorSpinner(label?: string) {
  return createSpinner(circleFrames, 150, label);
}

export function agentSpinner(label?: string) {
  return createSpinner(cornerFrames, 120, label);
}
