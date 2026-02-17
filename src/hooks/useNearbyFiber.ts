import { useEffect, useRef, useState } from 'react';
import type { FiberCable, NearbyFiberCable } from '../models/FiberCable';
import type { PowerPlant } from '../models/PowerPlant';

type WorkerResponse = {
  requestId: number;
  nearby: NearbyFiberCable[];
};

const FIBER_RADIUS_MILES = 5;

export function useNearbyFiber(
  persistentPlant: PowerPlant | null,
  fiberCables: FiberCable[],
  showFiberCables: boolean
) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  const [nearbyFiberCables, setNearbyFiberCables] = useState<NearbyFiberCable[]>([]);
  const [isCalculatingNearbyFiber, setIsCalculatingNearbyFiber] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/nearbyFiberWorker.ts', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { requestId, nearby } = event.data;
      if (requestId !== requestIdRef.current) return;

      setNearbyFiberCables(nearby);
      setIsCalculatingNearbyFiber(false);
    };

    worker.onerror = () => {
      setIsCalculatingNearbyFiber(false);
      setNearbyFiberCables([]);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!persistentPlant || !showFiberCables || fiberCables.length === 0) {
      setNearbyFiberCables([]);
      setIsCalculatingNearbyFiber(false);
      return;
    }

    requestIdRef.current += 1;
    setIsCalculatingNearbyFiber(true);

    const payload = {
      requestId: requestIdRef.current,
      plantCoordinates: persistentPlant.coordinates,
      cables: fiberCables,
      radiusMiles: FIBER_RADIUS_MILES,
    };

    workerRef.current?.postMessage(payload);
  }, [persistentPlant, showFiberCables, fiberCables]);

  return {
    nearbyFiberCables,
    isCalculatingNearbyFiber,
  };
}
