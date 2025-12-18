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
        <el-form-item :label="$t('subject')">
          <el-input v-model="form.subject" :placeholder="$t('subject')" />
        </el-form-item>
        <el-form-item :label="$t('content')">
          <el-input
              v-model="form.content"
              type="textarea"
              :rows="10"
              placeholder="HTML Content Supported"
          />
        </el-form-item>
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

    <el-card v-if="running || progress > 0" class="progress-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>{{$t('campaignProgress')}}</span>
          <el-tag :type="status === 'finished' ? 'success' : 'primary'">{{status}}</el-tag>
        </div>
      </template>
      <div class="progress-info">
        <el-progress :percentage="percentage" :status="status === 'finished' ? 'success' : ''" />
        <div class="counts">
          <span>Sent: {{sentCount}}</span>
          <span v-if="totalToSent > 0">Total Mission: {{totalToSent}}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import http from '@/axios/index.js'
import { ElMessage } from 'element-plus'

const { t } = useI18n()
const loadingStats = ref(false)
const running = ref(false)
const availableCount = ref(0)
const sentCount = ref(0)
const totalToSent = ref(0)
const status = ref('idle')

const form = reactive({
  subject: '',
  content: '',
  batchSize: 5
})

const percentage = computed(() => {
  if (totalToSent.value === 0) return 0
  return Math.min(100, Math.floor((sentCount.value / totalToSent.value) * 100))
})

onMounted(() => {
  getStats()
})

async function getStats() {
  loadingStats.value = true
  try {
    const data = await http.get('/campaign/stats')
    availableCount.value = data.count
  } catch (error) {
    console.error(error)
  } finally {
    loadingStats.value = false
  }
}

async function startCampaign() {
  running.value = true
  status.value = 'processing'
  sentCount.value = 0
  totalToSent.value = availableCount.value
  
  while (running.value) {
    try {
      const data = await http.post('/campaign/send', form)
      sentCount.value += data.sent
      
      if (data.status === 'finished' || data.sent === 0) {
        running.value = false
        status.value = 'finished'
        ElMessage.success('Campaign Completed')
        break
      }
      
      // 稍作停顿，避免压力过大
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(error)
      running.value = false
      status.value = 'error'
      break
    }
    
    // 每批次结束更新下统计
    await getStats()
  }
}
</script>

<style lang="scss" scoped>
.campaign-container {
  padding: 20px;
  max-width: 1000px;
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
}
</style>
