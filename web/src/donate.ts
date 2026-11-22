/*
 * USDT tips, straight from the visitor's wallet. Same addresses as FH English Learning —
 * if they change, change them in every FH project.
 * - USDT on Ethereum (ERC-20) can be sent from MetaMask.
 * - USDT on TRON (TRC-20) needs TronLink; MetaMask cannot send TRON.
 * Either address can also just be copied and paid from any wallet.
 */

export const DONATE_AMOUNTS = [1, 2, 3, 5, 10] as const

export interface DonateNetwork {
  id: 'eth' | 'tron'
  label: string
  short: string
  address: string
  /** USDT token contract on that chain. */
  token: string
  decimals: number
  wallet: string
  explorer: string
}

export const DONATE_NETWORKS: DonateNetwork[] = [
  {
    id: 'eth',
    label: 'Ethereum',
    short: 'ERC-20',
    address: '0x1c06cb9E403a4Dd4f06c4E0Ec56873467510218B',
    token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    wallet: 'MetaMask',
    explorer: 'https://etherscan.io/tx/',
  },
  {
    id: 'tron',
    label: 'TRON',
    short: 'TRC-20',
    address: 'TSQMMzHxFq8mo9v6AMjaoDf7YiAFwdGedR',
    token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    wallet: 'TronLink',
    explorer: 'https://tronscan.org/#/transaction/',
  },
]

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

interface TronWeb {
  defaultAddress?: { base58?: string | false }
  contract: () => {
    at: (addr: string) => Promise<{ transfer: (to: string, amount: string) => { send: () => Promise<string> } }>
  }
}

declare global {
  interface Window {
    ethereum?: Eip1193
    tronWeb?: TronWeb
    tronLink?: { request: (args: { method: string }) => Promise<unknown> }
  }
}

/** Thrown when the needed wallet extension is not installed. */
export class NoWalletError extends Error {}
/** Thrown when the user dismissed the wallet prompt — not an error worth showing. */
export class RejectedError extends Error {}

function erc20TransferData(to: string, units: bigint): string {
  const addr = to.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const amount = units.toString(16).padStart(64, '0')
  return `0xa9059cbb${addr}${amount}`
}

const toUnits = (usd: number, decimals: number) => BigInt(Math.round(usd * 10 ** decimals))

/** Sends `amount` USDT on `net` from the browser wallet; resolves with the tx hash. */
export async function sendTip(net: DonateNetwork, amount: number, onStep?: (step: string) => void): Promise<string> {
  try {
    if (net.id === 'eth') {
      const eth = window.ethereum
      if (!eth) throw new NoWalletError()
      onStep?.('connect')
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      const from = accounts?.[0]
      if (!from) throw new Error('No account was shared.')
      const chainId = (await eth.request({ method: 'eth_chainId' })) as string
      if (chainId !== '0x1') {
        onStep?.('switch')
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })
      }
      onStep?.('confirm')
      return (await eth.request({
        method: 'eth_sendTransaction',
        params: [{ from, to: net.token, data: erc20TransferData(net.address, toUnits(amount, net.decimals)), value: '0x0' }],
      })) as string
    }

    const tron = window.tronWeb
    if (!tron || !window.tronLink) throw new NoWalletError()
    onStep?.('connect')
    await window.tronLink.request({ method: 'tron_requestAccounts' })
    if (!tron.defaultAddress?.base58) throw new Error('TronLink is locked.')
    onStep?.('confirm')
    const contract = await tron.contract().at(net.token)
    return await contract.transfer(net.address, toUnits(amount, net.decimals).toString()).send()
  } catch (e) {
    if (e instanceof NoWalletError) throw e
    const err = e as { code?: number | string; message?: string }
    if (err?.code === 4001 || /reject|denied|cancel/i.test(err?.message ?? '')) throw new RejectedError()
    throw e instanceof Error ? e : new Error(err?.message ?? 'The transaction could not be started.')
  }
}
