export interface StudioAsset { id: string; name: string; kind: 'image'|'video'; url: string; source: 'upload'|'generated'|'local'; createdAt: number }
export interface ChatMessage { role: 'user'|'assistant'; content: string }
export interface MediaRequest { operation: 'split'|'trim'|'crop'|'concat'; urls: string[]; start?: number; end?: number; x?: number; y?: number; width?: number; height?: number }

export interface WebGenerationInput {kind:'image'|'video';prompt:string;accountId?:string;duration?:number;model?:string;ratio?:string}
export interface WebGenerationStatus {id:string;accountId:string;kind:'image'|'video';status:'preparing'|'awaiting-confirmation'|'downloading'|'completed'|'failed'|'cancelled';url?:string;name?:string;actualDuration?:number|null;error?:string}
