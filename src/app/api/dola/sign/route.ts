import {NextRequest,NextResponse} from 'next/server';
import {requireAuth} from '../../openapi/_auth';
import {DOLA_BASE} from '@/lib/dola-engine';
import {signDolaUrl} from '@/lib/dola-signer';
export const runtime='nodejs';
/** Main-process-only signing. No account cookies enter this endpoint. */
export async function POST(req:NextRequest) {
 const auth=requireAuth(req);if(!auth.ok)return NextResponse.json({error:auth.error},{status:401});
 const body=await req.json().catch(()=>null);if(body?.path!=='/chat/completion')return NextResponse.json({error:'不支持的签名路径'},{status:400});
 try{return NextResponse.json({url:await signDolaUrl(DOLA_BASE+body.path)});}catch{return NextResponse.json({error:'本机签名器不可用，请检查桌面资源'},{status:503});}
}
