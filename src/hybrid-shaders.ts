// Preview shader: fixed stars, image-derived cloud masses and cached 3D density.
export const hybridVertex = `attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
export const hybridFragment = `precision mediump float;varying vec2 uv;uniform sampler2D atlas;uniform sampler2D farBank;uniform sampler2D nearBank;uniform sampler2D farIncoming;uniform sampler2D nearIncoming;uniform sampler2D smallBank1;uniform sampler2D smallBank2;uniform vec4 drift;uniform vec4 flow;uniform float verticalDrift;uniform float coverage;uniform vec3 mood;uniform sampler2D starField;uniform float flash;uniform vec2 flashCenter;
vec2 sample3(vec3 p){p=fract(p)*64.;float z=floor(p.z),f=fract(p.z);vec2 xy=(p.xy*(63./64.)+.5)/512.;vec2 q0=vec2(mod(z,8.)*64.,floor(z/8.)*64.)/512.+xy;float zn=mod(z+1.,64.);vec2 q1=vec2(mod(zn,8.)*64.,floor(zn/8.)*64.)/512.+xy;return mix(texture2D(atlas,q0).rg,texture2D(atlas,q1).rg,f);}
vec3 volume(vec2 p,float z){vec2 a=sample3(vec3(p,z));vec2 b=sample3(vec3(p+vec2(.008,.004),z+.055));vec2 c=sample3(vec3(p+vec2(.016,.008),z+.110));
 vec3 d=smoothstep(vec3(.40),vec3(.61),vec3(a.x,b.x,c.x));
 float trans=exp(-.55*(d.x+d.y+d.z));float lit=(a.y*d.x+b.y*d.y+c.y*d.z)/(d.x+d.y+d.z+.001);return vec3(1.-trans,lit,a.x);}
vec3 harmonize(vec3 rgb){float l=dot(rgb,vec3(.2126,.7152,.0722));return mix(rgb,l*vec3(.92,.98,1.08),.80);}
void main(){vec2 p=uv;vec3 f=volume((p-vec2(0.,verticalDrift*.75))*.7-vec2(flow.x,0.),flow.y);vec3 n=volume((p-vec2(0.,verticalDrift))*.83+vec2(-flow.z,.0913),flow.w);
// Lighting is normalized by local density and can change sharply in sparse
// patches. Use the smoother density field for the displacement itself.
vec2 d0=vec2((f.z-.5)*.028,(f.z-.5)*.008),d1=vec2((n.z-.5)*.034,(n.z-.5)*.010);
// A tiny, slow strain gives the cloud bodies a little give in the wind.
// The periodic phase stays continuous when flow wraps; stars are unaffected.
float strain0=sin(flow.x*6.2831853),strain1=sin(flow.z*6.2831853+1.2);
d0+=vec2((p.x-.5)*.008*strain0,(p.y-.5)*.004*strain0);
d1+=vec2((p.x-.5)*.008*strain1,(p.y-.5)*.004*strain1);
// GAS_TRIAL_HOOK
float xa=p.x-drift.x+d0.x,xb=p.x-drift.y+d1.x;
vec4 a=xa>=0.?texture2D(farBank,vec2(xa,clamp(p.y-verticalDrift*.75+d0.y,0.,1.))):texture2D(farIncoming,vec2(xa+1.,clamp(p.y-verticalDrift*.75+d0.y,0.,1.)));
vec4 b=xb>=0.?texture2D(nearBank,vec2(xb,clamp(p.y-verticalDrift+d1.y,0.,1.))):texture2D(nearIncoming,vec2(xb+1.,clamp(p.y-verticalDrift+d1.y,0.,1.)));
a.rgb=harmonize(a.rgb);b.rgb=harmonize(b.rgb);
// A discharge is local and can affect only the cloud's own bright body.
vec2 delta=(p-flashCenter)*vec2(1.5,1.);float glow=exp(-dot(delta,delta)*45.)*flash;
// Keep the radial flash out of the sparse, translucent cloud fringes: those
// fringes otherwise make the circular light boundary visible against the sky.
float highlight=smoothstep(.045,.20,dot(a.rgb,vec3(.2126,.7152,.0722)))*a.a*smoothstep(.25,.65,a.a);
a.rgb+=vec3(.19,.23,.29)*glow*highlight;
// MICRO_CLOUD_GLOW
float nearHighlight=smoothstep(.045,.20,dot(b.rgb,vec3(.2126,.7152,.0722)))*b.a*smoothstep(.25,.65,b.a);
b.rgb+=vec3(.19,.23,.29)*glow*nearHighlight;
// Widen the soft edges without brightening the dark cores or adding another
// full-screen pass. The density field keeps their shape slowly evolving.
a.a=a.a*(1.55-.55*a.a)*(.82+.18*f.x);b.a=b.a*(1.55-.55*b.a)*(.82+.18*n.x);
a.rgb*=clamp(.78+f.x*.18+f.y*.20,.65,1.08);b.rgb*=clamp(.78+n.x*.18+n.y*.20,.65,1.08);
float alpha=b.a+a.a*(1.-b.a);vec3 color=b.rgb*b.a+a.rgb*a.a*(1.-b.a);
vec4 c=texture2D(smallBank1,vec2(fract(p.x-drift.z-.20+d0.x*.5),clamp(p.y-verticalDrift*1.1+.03+d0.y,0.,1.)));
vec4 d=texture2D(smallBank2,vec2(fract(p.x-drift.w+.16+d1.x*.5),clamp(p.y-verticalDrift*1.2-.04+d1.y,0.,1.)));
c.rgb=harmonize(c.rgb);d.rgb=harmonize(d.rgb);
c.a*=.56*(.7+.3*f.x);d.a*=.56*(.7+.3*n.x);c.rgb*=.9;d.rgb*=.9;
color=c.rgb*c.a+color*(1.-c.a);alpha=c.a+alpha*(1.-c.a);color=d.rgb*d.a+color*(1.-d.a);alpha=d.a+alpha*(1.-d.a);
color*=coverage*mood;alpha*=coverage;vec3 sky=texture2D(starField,p).rgb;gl_FragColor=vec4(color+sky*(1.-alpha),1.);}
`;

// A debug-only experiment: long-wavelength strain travels with each cloud
// bank. Its integer horizontal frequency makes the handoff at a full texture
// width continuous, including at the current/incoming boundary.
export const hybridGasFragment = hybridFragment.replace('// GAS_TRIAL_HOOK', `
float gas0=6.2831853*(p.x-drift.x+.35*p.y);
float gas1=6.2831853*(p.x-drift.y+.35*p.y);
d0+=vec2(.006*sin(gas0+flow.x*6.2831853),.003*sin(gas0-flow.y*6.2831853));
d1+=vec2(.006*sin(gas1+flow.z*6.2831853),.003*sin(gas1-flow.w*6.2831853));`);

// Separate comparison: reuse the existing small cloud texture to fill more of
// the lower edge. No extra texture lookup; the mask fades into the scene.
export const hybridFloorFragment = hybridGasFragment
  .replace('vec4 d=texture2D(smallBank2,vec2(fract(p.x-drift.w+.16+d1.x*.5),clamp(p.y-verticalDrift*1.2-.04+d1.y,0.,1.)));',
    'float lower=1.-smoothstep(.03,.48,p.y);vec4 d=texture2D(smallBank2,vec2(fract(p.x-drift.w+.16+d1.x*.5),clamp(p.y-verticalDrift*1.2-.04+d1.y+.14*lower,0.,1.)));')
  .replace('d.a*=.56*(.7+.3*n.x);', 'd.a*=mix(.56,.96,lower)*(.7+.3*n.x);');

// D is an isolated visual trial: broader strain remains smooth and bounded.
export const hybridStrongerGasFragment = hybridFloorFragment
  .replace('vec2(.006*sin(gas0+flow.x*6.2831853),.003*sin(gas0-flow.y*6.2831853))', 'vec2(.008*sin(gas0+flow.x*6.2831853),.004*sin(gas0-flow.y*6.2831853))')
  .replace('vec2(.006*sin(gas1+flow.z*6.2831853),.003*sin(gas1-flow.w*6.2831853))', 'vec2(.008*sin(gas1+flow.z*6.2831853),.004*sin(gas1-flow.w*6.2831853))');

// The experimental event is compiled only for the opt-in renderer, keeping
// its GPU work entirely out of the normal shader.
export const hybridMicroFragment = hybridFragment
  .replace('uniform vec2 flashCenter;', 'uniform vec2 flashCenter;uniform vec3 microGlow;')
  .replace('// MICRO_CLOUD_GLOW', `vec2 microDelta=(p-microGlow.xy)*vec2(1.5,1.);
float microLight=exp(-dot(microDelta,microDelta)*60.)*microGlow.z;
a.rgb+=vec3(.08,.09,.11)*microLight*highlight;`);

// Separate QA shader: the live renderer keeps its original sampling cost.
// This texture is blurred at load time so the existing fixed stars remain
// the only point-like stars as the galactic glow appears.
export const hybridMilkyFragment = hybridFragment
  .replace('uniform vec2 flashCenter;', 'uniform vec2 flashCenter;uniform sampler2D milkyField;uniform float milkyReveal;')
  .replace('vec3 sky=texture2D(starField,p).rgb;',
    'vec3 sky=texture2D(starField,p).rgb;sky+=texture2D(milkyField,p).rgb*milkyReveal*.75;');

// Each optional event gets its own QA shader. They are rendered behind the
// clouds and cannot add work or visual elements to the ordinary renderer.
const skyMicroCode = {
  twinkle: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);
    vec2 nearStar=clamp(v*256.,vec2(-8.),vec2(8.));
    float spark=exp(-dot(nearStar,nearStar)*3.8146973)*skyEvent.z;
    sky+=vec3(.42,.46,.52)*spark;`,
  meteor: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);
    vec2 axis=normalize(vec2(1.,-.1875));
    float along=dot(v,axis),across=dot(v,vec2(-axis.y,axis.x));
    float crossScaled=clamp(across*256.,-8.,8.);
    vec2 headScaled=clamp(v*256.,vec2(-8.),vec2(8.));
    float tail=step(along,0.)*(1.-smoothstep(0.,.12,-along))*exp(-crossScaled*crossScaled*4.5776367);
    float head=exp(-dot(headScaled,headScaled)*4.5776367);
    sky+=vec3(.40,.42,.45)*skyEvent.z*(head+tail*.65);`,
  satellite: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);
    vec2 nearPoint=clamp(v*256.,vec2(-8.),vec2(8.));
    float point=exp(-dot(nearPoint,nearPoint)*3.8146973)*skyEvent.z;
    sky+=vec3(.42,.46,.52)*point;`,
  aircraft: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);vec2 q=clamp(v*256.,vec2(-8.),vec2(8.));float dotLight=exp(-dot(q,q)*3.8);float blink=step(.75,sin(skyEvent.w*263.8938));sky+=vec3(.42,.28,.23)*dotLight*skyEvent.z*(.3+.7*blink);`,
  comet: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);float along=v.x*eventDirection;float across=clamp(v.y*256.,-8.,8.);float tail=step(along,0.)*(1.-smoothstep(0.,.07,-along))*exp(-across*across*4.5);vec2 q=clamp(v*256.,vec2(-8.),vec2(8.));sky+=vec3(.28,.34,.40)*skyEvent.z*(exp(-dot(q,q)*4.)+tail*.35);`,
  firefly: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);vec2 q=clamp(v*256.,vec2(-8.),vec2(8.));float glow=exp(-dot(q,q)*3.8);float pulse=.35+.65*pow(.5+.5*sin(skyEvent.w*31.4159),2.);sky+=vec3(.31,.27,.13)*glow*pulse*skyEvent.z;`,
  probe: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);vec2 q=clamp(v*256.,vec2(-8.),vec2(8.));float dotLight=exp(-dot(q,q)*3.8);sky+=vec3(.23,.32,.42)*dotLight*skyEvent.z;`,
  // Twenty streaks, spaced .45 s apart. At most three can overlap; all
  // share the original sky pass and use no texture or additional draw.
  meteor_shower: `float sec=skyEvent.w*10.;float latest=floor(sec/.45);float dir=eventDirection<0.?-1.:1.;vec3 streaks=vec3(0.);for(int j=0;j<3;j++){float idx=latest-float(j);float t=sec-idx*.45;float valid=step(0.,idx)*step(idx,19.)*step(0.,t)*step(t,1.1);float progress=clamp(t/1.1,0.,1.);float x=.12+.75*progress;if(dir<0.)x=1.-x;float y=.315+mod(idx*7.,11.)*.035-.14*progress+(skyEvent.y-.5);vec2 v=(p-vec2(x,y))*vec2(1.77778,1.);if(valid>.5&&abs(v.x)<.16&&abs(v.y)<.08){vec2 axis=normalize(vec2(dir,-.1875));float along=dot(v,axis);float crossScaled=clamp(dot(v,vec2(-axis.y,axis.x))*256.,-8.,8.);vec2 h=clamp(v*256.,vec2(-8.),vec2(8.));float tail=step(along,0.)*(1.-smoothstep(0.,.12,-along))*exp(-crossScaled*crossScaled*4.5776367);float head=exp(-dot(h,h)*4.5776367);float fade=smoothstep(0.,.12,progress)*(1.-smoothstep(.82,1.,progress));streaks+=vec3(.40,.42,.45)*(head+tail*.65)*fade;}}sky+=streaks*skyEvent.z;`,
  satellite_pair: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);vec2 a=clamp(v*256.,vec2(-8.),vec2(8.));vec2 b=clamp((v-vec2(.018,.006))*256.,vec2(-8.),vec2(8.));float lights=exp(-dot(a,a)*3.8)+.65*exp(-dot(b,b)*3.8);sky+=vec3(.36,.39,.44)*lights*skyEvent.z;`,
  ufo: `vec2 v=(p-skyEvent.xy)*vec2(1.77778,1.);
    float disc=1.-smoothstep(.65,1.,length(v/vec2(.015,.0035)));
    float dome=1.-smoothstep(.65,1.,length((v-vec2(0.,.003))/vec2(.006,.0035)));
    result=mix(result,vec3(.30,.34,.36),clamp((disc*.8+dome*.6)*skyEvent.z,0.,.8));
    // One tiny red light under the craft; no halo or full-screen flash.
    float lamp=1.-smoothstep(.45,1.,length((v-vec2(0.,-.0035))/vec2(.003,.0024)));
    float blink=smoothstep(.5,.8,.5+.5*sin(skyEvent.w*50.265482));
    result=mix(result,vec3(.55,.055,.035),lamp*blink*skyEvent.z*.9);`,
} as const;

export function hybridSkyMicroFragment(kind: keyof typeof skyMicroCode) {
  const shader = hybridFragment.replace('uniform vec2 flashCenter;', 'uniform vec2 flashCenter;uniform vec4 skyEvent;uniform float eventDirection;');
  // Stars and meteors are distant; the small craft is imagined below the
  // cloud deck and is therefore composed in front of it.
  return kind === 'ufo'
    ? shader.replace('gl_FragColor=vec4(color+sky*(1.-alpha),1.);',
      `vec3 result=color+sky*(1.-alpha);${skyMicroCode.ufo}gl_FragColor=vec4(result,1.);`)
    : shader.replace('vec3 sky=texture2D(starField,p).rgb;',
      `vec3 sky=texture2D(starField,p).rgb;${skyMicroCode[kind]}`);
}

// One uniform-selected event per draw: unused effects do not sample textures.
// The ninth texture is compiled only on hardware that reports enough units.
export function hybridLivingFragment(withMilky: boolean, cinematic = false, orbital = false) {
  const unifiedSky = orbital && withMilky;
  const milkyUniforms = withMilky ? `uniform sampler2D milkyField;uniform float milkyReveal;uniform vec2 milkyDirection;${cinematic && !orbital ? 'uniform vec2 milkyOffset;' : ''}${unifiedSky ? 'uniform float skyRotationBlend;' : ''}` : '';
  const milky = withMilky ? (unifiedSky
    ? `if(milkyReveal>0.0001){vec2 m=p-vec2(0.,.15*(1.-milkyRise));float edge=smoothstep(0.,.08,m.y);vec3 source=texture2D(milkyField,clamp(m,0.,1.)).rgb;vec3 band=max(source-vec3(.02,.035,.05),0.);sky+=band*milkyReveal*edge*.85;}`
    : `if(milkyReveal>0.0001){vec2 q=p-.5;vec2 m=vec2(q.x*milkyDirection.x-q.y*milkyDirection.y,q.x*milkyDirection.y+q.y*milkyDirection.x)+.5;${cinematic ? 'm+=vec2(-milkyOffset.x,milkyOffset.y);vec2 edge=min(m,vec2(1.)-m);float edgeFade=smoothstep(0.,.04,min(edge.x,edge.y));float horizon=1.-smoothstep(milkyReveal*1.3-.27,milkyReveal*1.3-.03,p.y);vec3 band=max(texture2D(milkyField,clamp(m,0.,1.)).rgb-vec3(.025,.04,.06),0.);sky+=band*milkyReveal*horizon*edgeFade*.75;' : 'sky+=texture2D(milkyField,clamp(m,0.,1.)).rgb*milkyReveal*.75;'}}`) : '';
  // Keep the background gradient fixed while rotating only its stars. This
  // avoids a visible repeated gradient seam as the finite sky texture wraps.
  // Keep the original stars stationary and match their background to the
  // cool blue of the Milky Way image throughout the ordinary sky.
  const rotatedSky = orbital ? 'sky*=vec3(.84,.92,1.12);' : '';
  const twinkle = skyMicroCode.twinkle;
  const meteor = skyMicroCode.meteor.replace('vec2(1.,-.1875)', 'vec2(eventDirection,-.1875)');
  let shader = hybridStrongerGasFragment;
  // Suppress only cloud material that would enter from offscreen. Existing
  // layers continue at their individual wind speeds and leave naturally.
  if (cinematic) shader = shader
    // At the start of clearing, most pixels are far from its edge. Avoid
    // evaluating the irregular-edge trigonometry for the entire frame.
    .replace('void main(){', `float cloudEdgeGate(float delta,float y,float density,float travel,bool nearLayer){
      if(delta>.10)return 1.;
      if(delta<-.16)return 0.;
      float amount=smoothstep(0.,.22,travel);
      float shape=nearLayer?(.04*sin(y*13.+.8)+.025*sin(y*21.)+.04*(density-.5)):(.045*sin(y*11.)+.025*sin(y*23.)+.04*(density-.5));
      return smoothstep(-.06,0.,delta+amount*shape);
    }
void main(){`)
    .replace('b.a=b.a*(1.55-.55*b.a)*(.82+.18*n.x);',
      'b.a=b.a*(1.55-.55*b.a)*(.82+.18*n.x);if(clearanceMode>0.5){float farEdge=clearanceMode<1.5?clearDistance*.35:refillDistance*.35;float nearEdge=clearanceMode<1.5?clearDistance*.45:refillDistance*.45;float travel=clearanceMode<1.5?clearDistance:refillDistance;float farGate=cloudEdgeGate(p.x-farEdge,p.y,f.z,travel,false);float nearGate=cloudEdgeGate(p.x-nearEdge,p.y,n.z,travel,true);a.a*=clearanceMode<1.5?farGate:1.-farGate;b.a*=clearanceMode<1.5?nearGate:1.-nearGate;}')
    .replace('c.rgb*=.9;d.rgb*=.9;',
      'if(clearanceMode>0.5){float cEdge=clearanceMode<1.5?clearDistance*.50:refillDistance*.50;float dEdge=clearanceMode<1.5?clearDistance*.58:refillDistance*.58;float travel=clearanceMode<1.5?clearDistance:refillDistance;float cGate=cloudEdgeGate(p.x-cEdge,p.y,f.z,travel,false);float dGate=cloudEdgeGate(p.x-dEdge,p.y,n.z,travel,true);c.a*=clearanceMode<1.5?cGate:1.-cGate;d.a*=clearanceMode<1.5?dGate:1.-dGate;}c.rgb*=.9;d.rgb*=.9;');
  return shader
    .replace('uniform vec2 flashCenter;', `uniform vec2 flashCenter;uniform vec4 skyEvent;uniform int eventKind;uniform float eventDirection;${milkyUniforms}${cinematic ? 'uniform float cloudRetreat;uniform float cloudTravel;uniform float skyMatch;uniform float clearanceMode;uniform float clearDistance;uniform float refillDistance;uniform float milkyRise;' : ''}`)
    .replace('vec3 sky=texture2D(starField,p).rgb;', `vec3 sky=texture2D(starField,p).rgb;${rotatedSky}${cinematic && !orbital ? 'sky*=mix(vec3(1.),vec3(.84,.92,.82),skyMatch);' : ''}${milky}if(eventKind==1){${twinkle}}else if(eventKind==2){${meteor}}else if(eventKind==3){${skyMicroCode.satellite}}else if(eventKind==5){${skyMicroCode.aircraft}}else if(eventKind==6){${skyMicroCode.comet}}else if(eventKind==7){${skyMicroCode.firefly}}else if(eventKind==8){${skyMicroCode.probe}}else if(eventKind==9){${skyMicroCode.meteor_shower}}else if(eventKind==10){${skyMicroCode.satellite_pair}}`)
    .replace('gl_FragColor=vec4(color+sky*(1.-alpha),1.);', `vec3 result=color+sky*(1.-alpha);if(eventKind==4){${skyMicroCode.ufo}}gl_FragColor=vec4(result,1.);`);
}
