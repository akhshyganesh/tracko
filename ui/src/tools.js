// tracko's tools for Claude. The handlers that carry them out live in app.js (claudeReply).
// All tools are strict: every object sets additionalProperties:false and lists every field as required;
// optional values are nullable via anyOf.
export const TOOLS=[
 {name:'file_items',description:"Save items from the user's message into the current chat's bucket. Use type 'task' for something to do, 'note' for something to remember, 'log' for something the user already did. Keep the user's wording, names and ticket numbers. One short line per item. Set remind_at (local time, YYYY-MM-DDTHH:MM) only when the user gives a day or time for a task.",
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['items','bucket_id'],properties:{
   items:{type:'array',items:{type:'object',additionalProperties:false,required:['type','text','remind_at'],properties:{type:{type:'string',enum:['task','note','log']},text:{type:'string'},remind_at:{anyOf:[{type:'string'},{type:'null'}]}}}},
   bucket_id:{anyOf:[{type:'string'},{type:'null'}],description:"Only set this to put the items in a different bucket than the chat's. Usually null."}}}},
 {name:'move_chat',description:'Move the current chat (and everything it saved) into a bucket. Use when the chat is in Inbox and one bucket clearly fits.',
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['bucket_id'],properties:{bucket_id:{type:'string'}}}},
 {name:'ask_bucket',description:"Ask the user which bucket this chat belongs in, when it could fit more than one or none. The app shows the options as buttons. Put the best guess first. Use new_bucket to suggest a name when no existing bucket fits.",
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['bucket_ids','new_bucket'],properties:{bucket_ids:{type:'array',items:{type:'string'}},new_bucket:{anyOf:[{type:'string'},{type:'null'}]}}}},
 {name:'create_bucket',description:'Create a new bucket. Only when the user asks for one by name.',
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['name','description'],properties:{name:{type:'string'},description:{type:'string'}}}},
 {name:'save_memory',description:"Save a lasting fact or preference about the user (their role, people they work with, how they like things done). Write it in the user's own words. Not for tasks or notes.",
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['text'],properties:{text:{type:'string'}}}},
 {name:'search_history',description:"Search the user's saved items. Dates are local YYYY-MM-DD. Returns one line per item: id | date | bucket | type | text.",
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['query','from_date','to_date','bucket_id','kind'],properties:{
   query:{anyOf:[{type:'string'},{type:'null'}],description:'Words to match. Null to match everything in the range.'},from_date:{anyOf:[{type:'string'},{type:'null'}]},to_date:{anyOf:[{type:'string'},{type:'null'}]},
   bucket_id:{anyOf:[{type:'string'},{type:'null'}]},kind:{type:'string',enum:['any','open_task','done','note','reminder']}}}},
 {name:'update_items',description:"Change items that are already saved: fix the wording, move or remove a reminder, or mark a task done or not done. Use this when the user corrects something instead of saving a new item. Leave a field null to keep it as it is.",
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['updates'],properties:{updates:{type:'array',items:{type:'object',additionalProperties:false,required:['item_id','text','remind_at','clear_reminder','done'],properties:{
   item_id:{type:'string'},text:{anyOf:[{type:'string'},{type:'null'}]},remind_at:{anyOf:[{type:'string'},{type:'null'}],description:'Local time, YYYY-MM-DDTHH:MM'},
   clear_reminder:{type:'boolean'},done:{anyOf:[{type:'boolean'},{type:'null'}]}}}}}}},
 {name:'show_items',description:'Attach items (by id from search_history) to your reply so the user sees them as a list.',
  strict:true,input_schema:{type:'object',additionalProperties:false,required:['item_ids'],properties:{item_ids:{type:'array',items:{type:'string'}}}}}
];
