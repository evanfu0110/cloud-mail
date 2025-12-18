<template>
  <div class="campaign-container">
    <div class="header">
      <div class="title">{{$t('campaign')}}</div>
      <div class="stats">
        <el-tag type="info" size="large">{{$t('availablePairs')}}: {{availableCount}}</el-tag>
      </div>
    </div>

    <el-card class="editor-card" shadow="never">
      <el-form label-position="top">
        <el-form-item :label="$t('selectTargets')">
           <div class="target-select-container">
             <el-checkbox v-model="form.allTargets" @change="handleTargetChange" style="margin-bottom: 8px;">
               {{ $t('allTargets') }}
             </el-checkbox>
             <el-select
                 v-if="!form.allTargets"
                 v-model="form.targetUserIds"
                 multiple
                 filterable
                 remote
                 reserve-keyword
                 :placeholder="$t('specificTargets')"
                 :remote-method="searchTargetUsers"
                 :loading="loadingTargets"
                 style="width: 100%"
                 @change="getStats"
             >
               <el-option
                   v-for="item in targetUserOptions"
                   :key="item.targetUserId"
                   :label="item.email"
                   :value="item.targetUserId"
               />
             </el-select>
           </div>
        </el-form-item>
        <el-form-item :label="$t('subject')">
          <el-input v-model="form.subject" :placeholder="$t('subject')" />
        </el-form-item>
        <el-form-item :label="$t('content')">
           <tinyEditor ref="editorRef" :def-value="''" @change="handleEditorChange" />
        </el-form-item>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item :label="$t('repeatCount')">
              <el-input-number v-model="form.repeatCount" :min="1" :max="10" @change="getStats" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="$t('batchDelay')">
              <el-input-number v-model="form.batchDelay" :min="0" :step="500" />
            </el-form-item>
          </el-col>
        </el-row>

        <div class="options" style="margin-bottom: 20px;">
          <el-checkbox v-model="form.allowRepeat" @change="getStats">{{ $t('allowRepeatSend') }}</el-checkbox>
        </div>
        
        <div class="actions">
          <el-button
              type="primary"
              :loading="running"
              :disabled="availableCount === 0 || !form.subject || !form.content"
              @click="startCampaign"
          >
            <Icon icon="mdi:play" width="18" height="18" style="margin-right: 4px" />
            {{$t('startCampaign')}}
          </el-button>
          <el-button @click="getStats" :loading="loadingStats">
            <Icon icon="mdi:refresh" width="18" height="18" />
          </el-button>
        </div>
      </el-form>
    </el-card>

    <el-card v-if="running || sentCount > 0" class="progress-card" shadow="hover" style="margin-bottom: 24px;">
      <template #header>
        <div class="card-header">
          <span>{{$t('campaignProgress')}}</span>
          <el-tag :type="status === 'finished' ? 'success' : 'primary'">{{status}}</el-tag>
        </div>
      </template>
      <div class="progress-info">
        <el-progress :percentage="percentage" :status="status === 'finished' ? 'success' : ''" />
        <div class="counts">
          <span>Sent Actions: {{sentCount}}</span>
          <span v-if="totalToSent > 0">Total Mission: {{totalToSent * form.repeatCount}}</span>
        </div>
      </div>
    </el-card>

    <el-card class="logs-card" :header="$t('taskLogs')" shadow="never">
      <el-table :data="logs" stripe height="300px">
        <el-table-column prop="from_email" :label="$t('fromAccount')" width="200" />
        <el-table-column prop="to_email" :label="$t('toTarget')" width="200" />
        <el-table-column prop="status" :label="$t('tabStatus')" width="100">
          <template #default="{row}">
            <el-tag :type="row.status === 0 ? 'success' : 'danger'">
              {{ row.status === 0 ? 'Success' : 'Fail' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="create_time" :label="$t('executionTime')" width="180">
          <template #default="{row}">
            {{ formatDate(row.create_time) }}
          </template>
        </el-table-column>
        <el-table-column prop="error" label="Error" min-width="200" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import http from '@/axios/index.js'
import { ElMessage } from 'element-plus'
import tinyEditor from '@/components/tiny-editor/index.vue'
import dayjs from 'dayjs'

const { t } = useI18n()
const loadingStats = ref(false)
const running = ref(false)
const availableCount = ref(0)
const sentCount = ref(0)
const totalToSent = ref(0)
const status = ref('idle')
const editorRef = ref(null)

const loadingTargets = ref(false)
const targetUserOptions = ref([])
const logs = ref([])
let logTimer = null

const form = reactive({
  subject: '',
  content: '',
  text: '',
  batchSize: 5,
  repeatCount: 1,
  batchDelay: 1000,
  allowRepeat: false,
  allTargets: true,
  targetUserIds: []
})

const percentage = computed(() => {
  const totalSlots = totalToSent.value * form.repeatCount
  if (totalSlots === 0) return 0
  return Math.min(100, Math.floor((sentCount.value / totalSlots) * 100))
})

onMounted(() => {
  getStats()
  getLogs()
  // 启动日志轮询
  logTimer = setInterval(getLogs, 5000)
})

onUnmounted(() => {
  if (logTimer) clearInterval(logTimer)
})

async function getStats() {
  loadingStats.value = true
  try {
    const params = {
      allowRepeat: form.allowRepeat,
      targetUserIds: form.allTargets ? '' : form.targetUserIds.join(',')
    }
    const data = await http.get('/campaign/stats', { params })
    availableCount.value = data.count
  } catch (error) {
    console.error(error)
  } finally {
    loadingStats.value = false
  }
}

async function getLogs() {
  try {
    const data = await http.get('/campaign/logs')
    logs.value = data
  } catch (err) {}
}

async function searchTargetUsers(query) {
  if (query !== '') {
    loadingTargets.value = true
    try {
      const data = await http.get('/target-user/list', { params: { email: query, num: 1, size: 50 } })
      targetUserOptions.value = data.list
    } catch (err) {
      console.error(err)
    } finally {
      loadingTargets.value = false
    }
  }
}

function handleTargetChange() {
  if (form.allTargets) {
    form.targetUserIds = []
  }
  getStats()
}

function handleEditorChange(content, text) {
  form.content = content
  form.text = text
}

async function startCampaign() {
  running.value = true
  status.value = 'processing'
  sentCount.value = 0
  totalToSent.value = availableCount.value
  
  while (running.value) {
    try {
      const payload = {
        ...form,
        targetUserIds: form.allTargets ? [] : form.targetUserIds
      }
      const data = await http.post('/campaign/send', payload)
      sentCount.value += data.sent
      
      if (data.status === 'finished' || data.sent === 0) {
        running.value = false
        status.value = 'finished'
        ElMessage.success('Campaign Completed')
        break
      }
      
      // 触发日志手动刷新
      getLogs()

      // 排队延迟逻辑：根据 batchDelay 等待
      if (form.batchDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, form.batchDelay))
      }
    } catch (error) {
      console.error(error)
      running.value = false
      status.value = 'error'
      break
    }
    
    await getStats()
  }
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style lang="scss" scoped>
.campaign-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    .title {
      font-size: 24px;
      font-weight: bold;
      color: var(--el-text-color-primary);
    }
  }

  .editor-card {
    margin-bottom: 24px;
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 12px;
    }
  }

  .progress-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .progress-info {
      padding: 12px 0;
      .counts {
        margin-top: 12px;
        display: flex;
        gap: 24px;
        color: var(--el-text-color-secondary);
        font-size: 14px;
      }
    }
  }

  .target-select-container {
    display: flex;
    flex-direction: column;
    width: 100%;
  }
}
</style>
