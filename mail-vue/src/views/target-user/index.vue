<template>
  <div class="target-user-container">
    <div class="header">
      <div class="title">{{$t('targetUserPool')}}</div>
      <div class="actions">
        <el-upload
            ref="uploadRef"
            action="#"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleFileChange"
            accept=".txt,.json"
        >
          <template #trigger>
            <el-button type="primary">
              <Icon icon="mdi:file-import-outline" width="18" height="18" style="margin-right: 4px" />
              {{$t('importEmails')}}
            </el-button>
          </template>
        </el-upload>
        <el-button type="danger" @click="handleClear" style="margin-left: 12px">
          <Icon icon="mdi:trash-can-outline" width="18" height="18" style="margin-right: 4px" />
          {{$t('clearPool')}}
        </el-button>
        <el-button type="success" @click="copyAllEmails">
          <Icon icon="mdi:content-copy" width="18" height="18" style="margin-right: 4px" />
          {{$t('copyAll')}}
        </el-button>
      </div>
    </div>

    <div class="search-bar">
      <el-input
          v-model="params.email"
          :placeholder="$t('searchByEmail')"
          clearable
          @clear="getList"
          @keyup.enter="getList"
          style="width: 300px"
      >
        <template #append>
          <el-button @click="getList">
            <Icon icon="mdi:magnify" width="18" height="18" />
          </el-button>
        </template>
      </el-input>
    </div>

    <el-table :data="list" style="width: 100%; margin-top: 20px" v-loading="loading">
      <el-table-column type="selection" width="55" />
      <el-table-column prop="email" :label="$t('emailAccount')" min-width="200" />
      <el-table-column prop="createTime" :label="$t('tabRegisteredAt')" width="180">
        <template #default="scope">
          {{ formatDate(scope.row.createTime) }}
        </template>
      </el-table-column>
      <el-table-column :label="$t('action')" width="120" fixed="right">
        <template #default="scope">
          <el-button link type="danger" @click="handleDelete(scope.row)">{{$t('delete')}}</el-button>
          <el-button link type="primary" @click="copyEmail(scope.row.email)">{{$t('copy')}}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination" v-if="total > 0">
      <el-pagination
          v-model:current-page="params.num"
          v-model:page-size="params.size"
          layout="total, prev, pager, next"
          :total="total"
          @current-change="getList"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import http from '@/axios/index.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'

const { t } = useI18n()
const loading = ref(false)
const list = ref([])
const total = ref(0)
const uploadRef = ref(null)

const params = reactive({
  num: 1,
  size: 20,
  email: ''
})

onMounted(() => {
  getList()
})

async function getList() {
  loading.value = true
  try {
    const data = await http.get('/target-user/list', { params })
    list.value = data.list
    total.value = data.total
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function handleFileChange(file) {
  const reader = new FileReader()
  const isJson = file.name.endsWith('.json')
  
  reader.onload = async (e) => {
    const content = e.target.result
    let emails = []
    
    try {
      if (isJson) {
        const data = JSON.parse(content)
        emails = Array.isArray(data) ? data : (data.emails || [])
      } else {
        // TXT: 一行一个
        emails = content.split('\n').map(s => s.trim()).filter(s => s && s.includes('@'))
      }
      
      if (emails.length === 0) {
        ElMessage.warning(t('noMessagesFound'))
        return
      }

      await importEmails(emails)
    } catch (err) {
      ElMessage.error('文件解析失败')
      console.error(err)
    }
  }
  
  reader.readAsText(file.raw)
}

async function importEmails(emails) {
  loading.value = true
  try {
    const data = await http.post('/target-user/import', { emails })
    ElMessage.success(t('importSuccess', { count: data.count }))
    getList()
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(t('delConfirm', { msg: row.email }), t('warning'), { type: 'warning' })
    await http.delete('/target-user/delete', { params: { targetUserIds: row.targetUserId } })
    ElMessage.success(t('delSuccessMsg'))
    getList()
  } catch (error) {}
}

async function handleClear() {
  try {
    await ElMessageBox.confirm(t('confirmClearPool'), t('warning'), { type: 'warning' })
    await http.delete('/target-user/clear')
    ElMessage.success(t('clearSuccess'))
    getList()
  } catch (error) {}
}

function copyEmail(email) {
  navigator.clipboard.writeText(email).then(() => {
    ElMessage.success(t('copySuccessMsg'))
  })
}

function copyAllEmails() {
  const emails = list.value.map(i => i.email).join('\n')
  navigator.clipboard.writeText(emails).then(() => {
    ElMessage.success(t('copySuccessMsg'))
  })
}

function formatDate(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style lang="scss" scoped>
.target-user-container {
  padding: 20px;
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    .title {
      font-size: 20px;
      font-weight: bold;
      color: var(--el-text-color-primary);
    }
    .actions {
      display: flex;
      align-items: center;
    }
  }
  .search-bar {
    margin-top: 20px;
  }
  .pagination {
    margin-top: 20px;
    display: center;
    justify-content: center;
  }
}
</style>
