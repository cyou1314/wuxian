import type { DolaRatio, DolaModel } from '@/types/libtv-schema';
import type { ChatMessage } from '../studio-types';
export interface Engine {
 id:string; name:string; capabilities:readonly string[];
 generateVideo(params:{prompt:string;model:DolaModel;duration:number;ratio:DolaRatio}):Promise<{playUrl?:string}>;
 generateImage(params:{prompt:string;ratio:DolaRatio}):Promise<{imageUrl:string}>;
 chat(messages:ChatMessage[],context?:string):Promise<string>;
 skillMetadata(type:number):Promise<Record<string,unknown>>;
}
