"use client";
import {useEffect,useRef} from "react";

/**
 * Turntable model of the scanned room: floor slab and walls at the measured
 * height, drag to orbit. Three.js is loaded on demand so the Measure tab
 * stays light for people who never open this tool.
 */
export function Room3D({corners,wallHeight}:{corners:Array<{x:number;y:number}>;wallHeight:number}){
  const host=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=host.current;if(!el||corners.length<3)return;
    let dispose=()=>{};let cancelled=false;
    void Promise.all([import("three"),import("three/addons/controls/OrbitControls.js")]).then(([THREE,{OrbitControls}])=>{
      if(cancelled)return;
      const width=el.clientWidth,height=Math.max(220,Math.round(width*0.7));
      const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"low-power"});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setSize(width,height);el.replaceChildren(renderer.domElement);
      const scene=new THREE.Scene();
      const cx=corners.reduce((a,c)=>a+c.x,0)/corners.length,cy=corners.reduce((a,c)=>a+c.y,0)/corners.length;
      const span=Math.max(...corners.map(c=>Math.hypot(c.x-cx,c.y-cy)))*2+1;
      const camera=new THREE.PerspectiveCamera(45,width/height,0.1,200);camera.position.set(span*0.9,span*0.8,span*0.9);
      const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.target.set(0,wallHeight/2,0);controls.update();
      scene.add(new THREE.HemisphereLight(0xffffff,0x222222,1.4));const sun=new THREE.DirectionalLight(0xfff2dc,1.2);sun.position.set(4,8,6);scene.add(sun);
      const shape=new THREE.Shape(corners.map(c=>new THREE.Vector2(c.x-cx,c.y-cy)));
      const floor=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color:0x2a2e30,side:THREE.DoubleSide}));floor.rotation.x=-Math.PI/2;scene.add(floor);
      const wallMat=new THREE.MeshStandardMaterial({color:0xff5f15,transparent:true,opacity:0.35,side:THREE.DoubleSide});
      const edgeMat=new THREE.LineBasicMaterial({color:0xffea00});
      for(let i=0;i<corners.length;i++){
        const a=corners[i],b=corners[(i+1)%corners.length];
        const len=Math.hypot(b.x-a.x,b.y-a.y);if(len<1e-6)continue;
        const wall=new THREE.Mesh(new THREE.PlaneGeometry(len,wallHeight),wallMat);
        wall.position.set((a.x+b.x)/2-cx,wallHeight/2,-((a.y+b.y)/2-cy));
        wall.rotation.y=-Math.atan2(b.y-a.y,b.x-a.x);
        scene.add(wall);
        const pts=[new THREE.Vector3(a.x-cx,0,-(a.y-cy)),new THREE.Vector3(a.x-cx,wallHeight,-(a.y-cy))];
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),edgeMat));
      }
      const outline=corners.map(c=>new THREE.Vector3(c.x-cx,0.002,-(c.y-cy)));outline.push(outline[0].clone());
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline),edgeMat));
      scene.add(new THREE.GridHelper(Math.ceil(span)*2,Math.ceil(span)*2,0x3a3f41,0x24282a));
      let raf=0;const render=()=>{controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(render);};render();
      const onResize=()=>{const w=el.clientWidth,h=Math.max(220,Math.round(w*0.7));renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
      window.addEventListener("resize",onResize);
      dispose=()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);controls.dispose();renderer.dispose();scene.traverse(o=>{const m=o as {geometry?:{dispose():void};material?:{dispose():void}};m.geometry?.dispose?.();m.material?.dispose?.();});el.replaceChildren();};
    }).catch(()=>{/* No WebGL: the plan and numbers still show. */});
    return()=>{cancelled=true;dispose();};
  },[corners,wallHeight]);
  return <div ref={host} className="measure-3d" aria-label="3D model of the scanned room" data-testid="measure-room-3d"/>;
}
