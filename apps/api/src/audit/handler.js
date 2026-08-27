import { createAuditPlatformRepository, createAuditPlatformService } from "../../../../packages/audit-platform/src/index.js";
import { synthesizeAuditResult } from "../../../../packages/audit-results/src/index.js";
import { baseResponseHeaders } from "../http/headers.js";

export const sharedAuditRepository=createAuditPlatformRepository();
const response=(status,body,headers={})=>({status,headers:baseResponseHeaders({"content-type":"application/json",...headers}),body});
const parse=(body)=>typeof body==="string"?JSON.parse(body):body??{};

export async function handleAuthenticatedAuditRequest({method,path,headers={},body,principal,auditRepository=sharedAuditRepository,signal}){
  const url=new URL(path,"http://internal");const parts=url.pathname.replace(/^\/+|\/+$/g,"").split("/");
  const isAuditRoute=parts[0]==="v1"&&(parts[1]==="session"||parts[1]==="workspaces"||parts[1]==="invitations");if(!isAuditRoute)return null;
  if(!principal?.authenticated)return response(401,{error:"unauthorized",message:"Authenticated session required."});
  await auditRepository.ensureUser?.(principal);
  const service=createAuditPlatformService({repository:auditRepository});
  try{
    if(method==="GET"&&parts.join("/")==="v1/session/workspaces")return response(200,{items:await service.listWorkspaces(principal)});
    if(method==="POST"&&parts.join("/")==="v1/workspaces")return response(201,{item:await service.createWorkspace(principal,parse(body))});
    if(method==="POST"&&parts.length===4&&parts[1]==="invitations"&&parts[3]==="accept")return response(200,{item:await service.acceptInvitation(principal,parts[2])});
    const workspaceId=parts[2];
    if(method==="POST"&&parts.length===4&&parts[3]==="conversations")return response(201,{item:await service.createConversation(principal,workspaceId,parse(body))});
    if(method==="GET"&&parts.length===5&&parts[3]==="conversations")return response(200,{item:await service.getConversation(principal,workspaceId,parts[4])});
    if(method==="GET"&&parts.length===6&&parts[3]==="conversations"&&parts[5]==="audit-result"){const {conversation,state}=await service.getConversation(principal,workspaceId,parts[4]);const auditState=state??{workspaceId,conversationId:parts[4],facts:{},conflicts:[],evidenceCoverage:0,confidence:"low",readiness:0};return response(200,{item:synthesizeAuditResult({objective:conversation.title,state:auditState})},{"cache-control":"no-store"});}
    if(method==="POST"&&parts.length===6&&parts[3]==="conversations"&&parts[5]==="messages"){
      const item=await service.sendMessage(principal,workspaceId,parts[4],parse(body),{idempotencyKey:headers["idempotency-key"]??headers["Idempotency-Key"],signal});
      if ((headers.accept??headers.Accept)==="text/event-stream") return {status:200,headers:baseResponseHeaders({"content-type":"text/event-stream","cache-control":"no-store",connection:"keep-alive"}),body:toCopilotSse(item)};
      return response(200,{item},{"cache-control":"no-store"});
    }
    if(method==="POST"&&parts.length===4&&parts[3]==="invitations")return response(201,{item:await service.invite(principal,workspaceId,parse(body))});
    if(method==="POST"&&parts.length===6&&parts[3]==="members"&&parts[5]==="revoke")return response(200,{item:await service.revoke(principal,workspaceId,parts[4])});
    if(method==="POST"&&parts.length===4&&parts[3]==="tools")return response(202,{item:await service.invokeTool(principal,workspaceId,parse(body))});
    return response(404,{error:"not_found",message:"Audit route not found."});
  }catch(error){return response(error.status??500,{error:error.code??(error.status===403?"forbidden":error.status===401?"unauthorized":"request_failed"),message:error.status?error.message:"Audit request failed safely."});}
}

export function toCopilotSse(item){return [
  `event: message\ndata: ${JSON.stringify({id:item.userMessage.id,status:"accepted"})}\n\n`,
  `event: delta\ndata: ${JSON.stringify({text:item.assistant.content})}\n\n`,
  `event: canvas\ndata: ${JSON.stringify(item.canvas.projection)}\n\n`,
  `event: done\ndata: ${JSON.stringify({messageId:item.assistant.id,readiness:item.state.readiness})}\n\n`
].join("");}
