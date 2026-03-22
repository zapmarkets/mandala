import { ethers } from 'ethers';

import RegistryABI from './abis/MandalaAgentRegistry.json';
import FactoryABI from './abis/MandalaFactory.json';
import TaskABI from './abis/MandalaTask.json';
import PolicyABI from './abis/MandalaPolicy.json';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545';

const ADDRESSES = {
  policy: process.env.NEXT_PUBLIC_POLICY_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  factory: process.env.NEXT_PUBLIC_FACTORY_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
};

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL);
}

export function getRegistry(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const sp = signerOrProvider || getProvider();
  return new ethers.Contract(ADDRESSES.registry, RegistryABI, sp);
}

export function getFactory(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const sp = signerOrProvider || getProvider();
  return new ethers.Contract(ADDRESSES.factory, FactoryABI, sp);
}

export function getTask(address: string, signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const sp = signerOrProvider || getProvider();
  return new ethers.Contract(address, TaskABI, sp);
}

export function getPolicy(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const sp = signerOrProvider || getProvider();
  return new ethers.Contract(ADDRESSES.policy, PolicyABI, sp);
}

export function truncateAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatEth(wei: bigint): string {
  return ethers.formatEther(wei);
}

export { ADDRESSES, RPC_URL, RegistryABI, FactoryABI, TaskABI, PolicyABI };
