import type { MeshResult } from '../types';

export interface MeshJob {
  sectionId: string;
  blocks: Uint16Array;
  neighbors: {
    px?: Uint16Array;
    nx?: Uint16Array;
    py?: Uint16Array;
    ny?: Uint16Array;
    pz?: Uint16Array;
    nz?: Uint16Array;
  };
  priority: number;
  resolve: (result: MeshResult) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private jobQueue: MeshJob[] = [];
  private pendingJobs: Map<string, MeshJob> = new Map();

  constructor(numWorkers = navigator.hardwareConcurrency || 4) {
    // Limit workers on mobile
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const workerCount = isMobile ? Math.min(numWorkers, 2) : Math.min(numWorkers, 4);

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        new URL('./mesh.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent<MeshResult>) => {
        this.handleWorkerResult(worker, e.data);
      };

      worker.onerror = (e) => {
        console.error('[WorkerPool] Worker error:', e);
        this.busyWorkers.delete(worker);
        this.processQueue();
      };

      this.workers.push(worker);
    }

    console.log(`[WorkerPool] Created ${workerCount} mesh workers`);
  }

  private handleWorkerResult(worker: Worker, result: MeshResult): void {
    this.busyWorkers.delete(worker);

    const job = this.pendingJobs.get(result.sectionId);
    if (job) {
      this.pendingJobs.delete(result.sectionId);
      job.resolve(result);
    }

    this.processQueue();
  }

  private processQueue(): void {
    while (this.jobQueue.length > 0 && this.busyWorkers.size < this.workers.length) {
      // Sort by priority (lower is higher priority)
      this.jobQueue.sort((a, b) => a.priority - b.priority);

      const job = this.jobQueue.shift();
      if (!job) break;

      const availableWorker = this.workers.find(w => !this.busyWorkers.has(w));
      if (!availableWorker) break;

      this.busyWorkers.add(availableWorker);
      this.pendingJobs.set(job.sectionId, job);

      availableWorker.postMessage({
        type: 'MESH_REQUEST',
        sectionId: job.sectionId,
        blocks: job.blocks,
        neighbors: job.neighbors
      }, [
        job.blocks.buffer,
        ...(job.neighbors.px ? [job.neighbors.px.buffer] : []),
        ...(job.neighbors.nx ? [job.neighbors.nx.buffer] : []),
        ...(job.neighbors.py ? [job.neighbors.py.buffer] : []),
        ...(job.neighbors.ny ? [job.neighbors.ny.buffer] : []),
        ...(job.neighbors.pz ? [job.neighbors.pz.buffer] : []),
        ...(job.neighbors.nz ? [job.neighbors.nz.buffer] : [])
      ]);
    }
  }

  requestMesh(
    sectionId: string,
    blocks: Uint16Array,
    neighbors: MeshJob['neighbors'],
    priority = 0
  ): Promise<MeshResult> {
    // Cancel existing job for this section
    this.cancelJob(sectionId);

    return new Promise((resolve, reject) => {
      const job: MeshJob = {
        sectionId,
        blocks: new Uint16Array(blocks), // Clone for transfer
        neighbors: {
          px: neighbors.px ? new Uint16Array(neighbors.px) : undefined,
          nx: neighbors.nx ? new Uint16Array(neighbors.nx) : undefined,
          py: neighbors.py ? new Uint16Array(neighbors.py) : undefined,
          ny: neighbors.ny ? new Uint16Array(neighbors.ny) : undefined,
          pz: neighbors.pz ? new Uint16Array(neighbors.pz) : undefined,
          nz: neighbors.nz ? new Uint16Array(neighbors.nz) : undefined
        },
        priority,
        resolve,
        reject
      };

      this.jobQueue.push(job);
      this.processQueue();
    });
  }

  cancelJob(sectionId: string): void {
    // Remove from queue
    const index = this.jobQueue.findIndex(j => j.sectionId === sectionId);
    if (index !== -1) {
      const job = this.jobQueue.splice(index, 1)[0];
      job.reject(new Error('Job cancelled'));
    }

    // Can't cancel in-flight jobs, but we can ignore their results
    this.pendingJobs.delete(sectionId);
  }

  getQueueLength(): number {
    return this.jobQueue.length;
  }

  getBusyWorkerCount(): number {
    return this.busyWorkers.size;
  }

  dispose(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.jobQueue = [];
    this.pendingJobs.clear();
    this.busyWorkers.clear();
  }
}
