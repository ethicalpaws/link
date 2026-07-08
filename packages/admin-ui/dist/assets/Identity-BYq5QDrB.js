import{o as p,j as n,a as v,c as y,b as e,w as i,v as d,r as u}from"./index-BtE94RUi.js";import{a as l}from"./api-BjFZtnZQ.js";const f={class:"card"},x={class:"mb"},b={class:"card"},w={class:"mb"},k={__name:"Identity",setup(g){const a=u(""),o=u("");p(async()=>{try{const[s,t]=await Promise.all([l.get("/api/admin/identity"),l.get("/api/admin/user-md")]);a.value=s.content||"",o.value=t.content||""}catch(s){n(s.message,"error")}});async function c(){try{await l.put("/api/admin/identity",{content:a.value}),n("✅ 核心初衷已保存")}catch(s){n(s.message,"error")}}async function m(){try{await l.put("/api/admin/user-md",{content:o.value}),n("✅ 身份信息已保存并同步到所有战友")}catch(s){n(s.message,"error")}}return(s,t)=>(v(),y("div",null,[t[6]||(t[6]=e("h1",null,"🪪 身份",-1)),e("div",f,[t[3]||(t[3]=e("h2",null,"📄 核心初衷",-1)),e("div",x,[t[2]||(t[2]=e("label",{style:{color:"#888","font-size":"12px"}},"你的核心初衷，独立保存到 data/core_identity.md",-1)),i(e("textarea",{"onUpdate:modelValue":t[0]||(t[0]=r=>a.value=r),rows:"8",style:{"font-size":"14px"},placeholder:`记录你使用 LINK 的核心目的和初衷，例如：

我想要通过 LINK 记录自己的成长轨迹，
让 AI 战友了解我的背景和需求，
帮助我更好地规划学习和生活。`},null,512),[[d,a.value]])]),e("div",{class:"flex"},[e("button",{class:"btn",onClick:c},"💾 保存")])]),e("div",b,[t[5]||(t[5]=e("h2",null,"📄 身份信息（推荐匿版）",-1)),e("div",w,[t[4]||(t[4]=e("label",{style:{color:"#888","font-size":"12px"}},"写入 agents/{id}/USER.md 的内容，保存后自动同步到所有战友目录",-1)),i(e("textarea",{"onUpdate:modelValue":t[1]||(t[1]=r=>o.value=r),rows:"8",style:{"font-size":"14px"},placeholder:`填写你希望战友看到的虚拟身份信息，例如：

# USER · 关于用户
我是一个热爱学习和分享的人，
喜欢探索新技术，也喜欢运动和阅读。
希望能和战友们一起成长进步。`},null,512),[[d,o.value]])]),e("div",{class:"flex"},[e("button",{class:"btn",onClick:m},"💾 保存并同步")])])]))}};export{k as default};
