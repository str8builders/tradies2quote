import manifest from "@/lib/install-manifest";
export function GET(){return Response.json(manifest(),{headers:{"Content-Type":"application/manifest+json","Cache-Control":"public, max-age=3600"}});}
