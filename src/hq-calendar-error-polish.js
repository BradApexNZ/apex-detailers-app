function friendlyCalendarMessage(value){
  const text=String(value||"").trim();
  if(!text) return "Google Calendar could not be loaded. Try again or reconnect Google.";
  const lower=text.toLowerCase();
  if(lower==="internal"||lower.includes("functions/internal")||lower.includes("firebase")||lower.includes("unknown error")){
    return "Google Calendar could not be loaded. Try again, then reconnect Google if it keeps failing.";
  }
  if(lower.includes("permission")||lower.includes("unauth")||lower.includes("reconnect")||lower.includes("credential")||lower.includes("token")){
    return "Google Calendar needs to be reconnected before Apex can load events.";
  }
  if(lower.includes("network")||lower.includes("unavailable")||lower.includes("timeout")){
    return "Google Calendar is temporarily unavailable. Check your connection and try again.";
  }
  return text.length>120?"Google Calendar could not be loaded. Try again or reconnect Google.":text;
}

function polishCalendarError(){
  document.querySelectorAll(".apexCalendarFeed.error span").forEach(node=>{
    const cleaned=friendlyCalendarMessage(node.textContent);
    if(node.textContent!==cleaned) node.textContent=cleaned;
  });
}

const observer=new MutationObserver(polishCalendarError);
observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
polishCalendarError();
