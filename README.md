
Test curls

curl https://siri-calendar-api.vercel.app/

curl https://siri-calendar-api.vercel.app/api/today

curl -X POST https://siri-calendar-api.vercel.app/api/create \
  -H "Content-Type: application/json" \
  -d '{"eventText": "Meeting with team tomorrow at 3pm"}'

curl -X POST https://siri-calendar-api.vercel.app/api/query \
  -H "Content-Type: application/json" \
  -d '{"dateText": "next Monday"}'

curl -X POST https://siri-calendar-api.vercel.app/api/delete \
  -H "Content-Type: application/json" \
  -d '{"eventText": "cancel meeting tomorrow"}'

Add LLM
Add update function
Focus on the tokenisation problem
when does that token expire?
push on github