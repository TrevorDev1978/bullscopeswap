// components/SwapActionButton.tsx
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

type Props = { onSwap: () => void; disabled?: boolean; labelSwap?: string };

export default function SwapActionButton({ onSwap, disabled, labelSwap = 'Swap' }: Props){
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  if (!isConnected) {
    return (
      <button type="button" className="btn-wallet" onClick={() => openConnectModal?.()}>
        Connect Wallet
      </button>
    );
  }
  return (
    <button type="button" className="confirm-btn" onClick={onSwap} disabled={disabled}>
      {labelSwap}
    </button>
  );
}
