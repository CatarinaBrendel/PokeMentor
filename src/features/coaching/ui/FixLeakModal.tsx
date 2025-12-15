import Modal from "../../../shared/ui/Modal";

type FixLeakModalProps = {
  open: boolean;
  leak: string;
  onClose: () => void;
  onStartDrill?: () => void;
};

export default function FixLeakModal({
  open,
  leak,
  onClose,
  onStartDrill,
}: FixLeakModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`Fix: ${leak}`} maxWidthClassName="max-w-xl">
      <p className="text-dust-600">
        You tend to give up tempo by switching too often in neutral positions. This costs positioning
        and allows free setup.
      </p>

      <ul className="mt-4 list-disc space-y-2 pl-5 text-dust-600">
        <li>Identify when your current Pokémon already checks the threat</li>
        <li>Delay switches until damage or info is gained</li>
        <li>Practice staying in on low-risk turns</li>
      </ul>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-4 py-2 text-sm text-dust-700 hover:bg-black/5"
        >
          Not now
        </button>

        <button
          type="button"
          onClick={onStartDrill}
          className="rounded-xl bg-fern-700 px-4 py-2 text-sm font-semibold text-dust-50 hover:opacity-95"
        >
          Start Practice Drill
        </button>
      </div>
    </Modal>
  );
}